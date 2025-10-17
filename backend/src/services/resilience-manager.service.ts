import { EventEmitter } from 'events';
import { CircuitBreakerManager } from './circuit-breaker-manager.service.js';
import { FallbackService } from './fallback.service.js';
import { ErrorHandlerService } from './error-handler.service.js';
import { HealthCheckService } from './health-check.service.js';
import { Message, AgentType } from '../types/index.js';
import { AgentMessage } from '../agents/base.agent.js';
import { logger } from '../utils/logger.js';

export interface ResilienceConfig {
  enableCircuitBreakers: boolean;
  enableFallbacks: boolean;
  enableErrorHandling: boolean;
  enableHealthMonitoring: boolean;
  degradationThresholds: {
    errorRate: number;
    responseTime: number;
    failedAgents: number;
  };
  recoveryThresholds: {
    errorRate: number;
    responseTime: number;
    healthyAgents: number;
  };
}

export interface SystemResilienceStatus {
  mode: 'normal' | 'degraded' | 'emergency';
  timestamp: Date;
  circuitBreakers: {
    total: number;
    open: number;
    halfOpen: number;
    closed: number;
  };
  fallbacks: {
    active: boolean;
    cacheHitRate: number;
    fallbacksUsed: number;
  };
  errors: {
    recentCount: number;
    errorRate: number;
    averageResolutionTime: number;
  };
  health: {
    overallStatus: string;
    healthyServices: number;
    totalServices: number;
  };
}

export class ResilienceManager extends EventEmitter {
  private config: ResilienceConfig;
  private circuitBreakerManager: CircuitBreakerManager;
  private fallbackService: FallbackService;
  private errorHandlerService: ErrorHandlerService;
  private healthCheckService: HealthCheckService;
  private currentMode: 'normal' | 'degraded' | 'emergency' = 'normal';
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(
    config: ResilienceConfig,
    circuitBreakerManager: CircuitBreakerManager,
    fallbackService: FallbackService,
    errorHandlerService: ErrorHandlerService,
    healthCheckService: HealthCheckService
  ) {
    super();
    this.config = config;
    this.circuitBreakerManager = circuitBreakerManager;
    this.fallbackService = fallbackService;
    this.errorHandlerService = errorHandlerService;
    this.healthCheckService = healthCheckService;

    this.setupEventListeners();
  }

  /**
   * Start resilience monitoring
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Resilience manager is already running');
      return;
    }

    this.isRunning = true;
    
    // Start monitoring system health and adjusting mode
    this.monitoringInterval = setInterval(() => {
      this.evaluateSystemMode();
    }, 30000); // Check every 30 seconds

    logger.info('Resilience manager started');
    this.emit('resilience:started');
  }

  /**
   * Stop resilience monitoring
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('Resilience manager stopped');
    this.emit('resilience:stopped');
  }

  /**
   * Execute agent operation with full resilience protection
   */
  public async executeWithResilience<T>(
    agentId: string,
    agentType: AgentType,
    operation: () => Promise<T>,
    context?: {
      userId?: string;
      sessionId?: string;
      userMessage?: Message;
    }
  ): Promise<T> {
    const operationContext = {
      userId: context?.userId,
      sessionId: context?.sessionId,
      agentId,
      agentType,
      operation: 'agent_execution',
      timestamp: new Date(),
      userMessage: context?.userMessage?.content
    };

    try {
      // Use circuit breaker protection if enabled
      if (this.config.enableCircuitBreakers) {
        return await this.circuitBreakerManager.executeAgentCall(
          agentId,
          agentType,
          operation
        );
      } else {
        return await operation();
      }
    } catch (error) {
      logger.warn(`Agent operation failed for ${agentId}:`, error);
      
      // Handle error and potentially provide fallback
      return await this.handleOperationFailure(
        error as Error,
        agentType,
        operationContext,
        context?.userMessage
      );
    }
  }

  /**
   * Execute agent message with resilience protection
   */
  public async executeAgentMessageWithResilience(
    agentId: string,
    agentType: AgentType,
    message: AgentMessage,
    sendFunction: (message: AgentMessage) => Promise<AgentMessage | null>,
    context?: {
      userId?: string;
      sessionId?: string;
    }
  ): Promise<AgentMessage | null> {
    return await this.executeWithResilience(
      agentId,
      agentType,
      () => sendFunction(message),
      {
        ...context,
        userMessage: {
          id: message.id,
          sender: 'student',
          content: JSON.stringify(message.payload),
          timestamp: message.timestamp,
          metadata: { messageType: 'request', agentId }
        }
      }
    );
  }

  /**
   * Get current system resilience status
   */
  public getResilienceStatus(): SystemResilienceStatus {
    const cbSummary = this.circuitBreakerManager.getSystemHealthSummary();
    const fallbackStatus = this.fallbackService.getDegradationStatus();
    const errorStats = this.errorHandlerService.getErrorStatistics();
    const healthSummary = this.healthCheckService.getLastHealth();

    return {
      mode: this.currentMode,
      timestamp: new Date(),
      circuitBreakers: {
        total: cbSummary.totalAgents,
        open: cbSummary.failedAgents,
        halfOpen: cbSummary.degradedAgents,
        closed: cbSummary.healthyAgents
      },
      fallbacks: {
        active: fallbackStatus.isInDegradedMode,
        cacheHitRate: fallbackStatus.cacheHitRate,
        fallbacksUsed: fallbackStatus.fallbacksActive
      },
      errors: {
        recentCount: errorStats.recentErrors,
        errorRate: errorStats.totalErrors > 0 ? errorStats.recentErrors / errorStats.totalErrors : 0,
        averageResolutionTime: errorStats.averageResolutionTime
      },
      health: {
        overallStatus: healthSummary?.status || 'unknown',
        healthyServices: healthSummary?.services.filter(s => s.status === 'healthy').length || 0,
        totalServices: healthSummary?.services.length || 0
      }
    };
  }

  /**
   * Force system into specific mode
   */
  public setSystemMode(mode: 'normal' | 'degraded' | 'emergency'): void {
    const previousMode = this.currentMode;
    this.currentMode = mode;
    
    logger.info(`System mode changed from ${previousMode} to ${mode}`);
    this.emit('resilience:mode_changed', {
      previousMode,
      currentMode: mode,
      timestamp: new Date()
    });

    // Apply mode-specific configurations
    this.applyModeConfiguration(mode);
  }

  /**
   * Handle operation failure with fallback mechanisms
   */
  private async handleOperationFailure<T>(
    error: Error,
    agentType: AgentType,
    context: any,
    userMessage?: Message
  ): Promise<T> {
    // Handle error and get user-friendly response
    if (this.config.enableErrorHandling) {
      const errorResponse = await this.errorHandlerService.handleError(error, context);
      
      // If we have a user message and fallbacks are enabled, try to provide a fallback response
      if (userMessage && this.config.enableFallbacks) {
        const fallbackResponse = await this.fallbackService.getFallbackResponse(
          userMessage,
          agentType,
          context
        );
        
        if (fallbackResponse) {
          // Convert fallback response to the expected format
          const fallbackMessage: Message = {
            id: `fallback-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            sender: agentType,
            content: fallbackResponse.content,
            timestamp: new Date(),
            metadata: fallbackResponse.metadata
          };
          
          // Cache the successful fallback for future use
          this.fallbackService.cacheSuccessfulResponse(
            userMessage.content,
            fallbackMessage,
            agentType
          );
          
          return fallbackMessage as T;
        }
      }
      
      // Return error response as fallback
      return errorResponse as T;
    }
    
    // If error handling is disabled, re-throw the error
    throw error;
  }

  /**
   * Setup event listeners for system components
   */
  private setupEventListeners(): void {
    // Listen to circuit breaker events
    this.circuitBreakerManager.on('global:circuit_breaker_state_changed', (event) => {
      logger.warn(`Global circuit breaker state changed: ${event.currentState}`);
      this.evaluateSystemMode();
    });

    this.circuitBreakerManager.on('agent:circuit_breaker_state_changed', (event) => {
      if (event.currentState === 'OPEN') {
        logger.warn(`Agent ${event.agentId} circuit breaker opened`);
        this.evaluateSystemMode();
      }
    });

    // Listen to health check events
    this.healthCheckService.on('health_check:completed', (health) => {
      if (health.status === 'unhealthy') {
        logger.warn('System health check indicates unhealthy status');
        this.evaluateSystemMode();
      }
    });

    // Listen to error events
    this.errorHandlerService.on('error:handled', (event) => {
      if (event.userFriendlyError.severity === 'high') {
        logger.warn('High severity error handled');
        this.evaluateSystemMode();
      }
    });
  }

  /**
   * Evaluate and adjust system mode based on current conditions
   */
  private async evaluateSystemMode(): Promise<void> {
    try {
      const status = this.getResilienceStatus();
      let newMode = this.currentMode;

      // Determine if we should be in emergency mode
      if (this.shouldEnterEmergencyMode(status)) {
        newMode = 'emergency';
      }
      // Determine if we should be in degraded mode
      else if (this.shouldEnterDegradedMode(status)) {
        newMode = 'degraded';
      }
      // Check if we can return to normal mode
      else if (this.canReturnToNormalMode(status)) {
        newMode = 'normal';
      }

      // Change mode if needed
      if (newMode !== this.currentMode) {
        this.setSystemMode(newMode);
      }
    } catch (error) {
      logger.error('Error evaluating system mode:', error);
    }
  }

  /**
   * Check if system should enter emergency mode
   */
  private shouldEnterEmergencyMode(status: SystemResilienceStatus): boolean {
    // Emergency mode if:
    // - More than 80% of circuit breakers are open
    // - System health is unhealthy
    // - Error rate is very high
    
    const cbFailureRate = status.circuitBreakers.total > 0 ? 
      status.circuitBreakers.open / status.circuitBreakers.total : 0;
    
    return cbFailureRate > 0.8 || 
           status.health.overallStatus === 'unhealthy' ||
           status.errors.errorRate > 0.5;
  }

  /**
   * Check if system should enter degraded mode
   */
  private shouldEnterDegradedMode(status: SystemResilienceStatus): boolean {
    // Degraded mode if:
    // - Some circuit breakers are open or half-open
    // - System health is degraded
    // - Error rate exceeds threshold
    
    const cbIssueRate = status.circuitBreakers.total > 0 ? 
      (status.circuitBreakers.open + status.circuitBreakers.halfOpen) / status.circuitBreakers.total : 0;
    
    return cbIssueRate > this.config.degradationThresholds.failedAgents ||
           status.health.overallStatus === 'degraded' ||
           status.errors.errorRate > this.config.degradationThresholds.errorRate;
  }

  /**
   * Check if system can return to normal mode
   */
  private canReturnToNormalMode(status: SystemResilienceStatus): boolean {
    // Can return to normal if:
    // - Most circuit breakers are closed
    // - System health is healthy
    // - Error rate is low
    
    const cbHealthRate = status.circuitBreakers.total > 0 ? 
      status.circuitBreakers.closed / status.circuitBreakers.total : 1;
    
    return cbHealthRate >= this.config.recoveryThresholds.healthyAgents &&
           status.health.overallStatus === 'healthy' &&
           status.errors.errorRate <= this.config.recoveryThresholds.errorRate;
  }

  /**
   * Apply configuration based on current mode
   */
  private applyModeConfiguration(mode: 'normal' | 'degraded' | 'emergency'): void {
    switch (mode) {
      case 'normal':
        // Normal operation - all features enabled
        logger.info('System operating in normal mode');
        break;
        
      case 'degraded':
        // Degraded mode - enable all fallback mechanisms
        logger.warn('System operating in degraded mode - fallbacks active');
        break;
        
      case 'emergency':
        // Emergency mode - minimal functionality only
        logger.error('System operating in emergency mode - minimal functionality');
        // Could implement additional restrictions here
        break;
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stop();
    this.removeAllListeners();
  }
}