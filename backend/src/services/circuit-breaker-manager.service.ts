import { EventEmitter } from 'events';
import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerMetrics, CircuitState } from './circuit-breaker.service.js';
import { RetryService, RetryConfig } from './retry.service.js';
import { AgentMessage } from '../agents/base.agent.js';
import { AgentType } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface CircuitBreakerManagerConfig {
  defaultCircuitBreakerConfig: CircuitBreakerConfig;
  defaultRetryConfig: RetryConfig;
  agentSpecificConfigs?: Record<string, Partial<CircuitBreakerConfig>>;
  enableGlobalCircuitBreaker: boolean;
  globalFailureThreshold: number;
}

export interface AgentCircuitBreakerMetrics extends CircuitBreakerMetrics {
  agentId: string;
  agentType: AgentType;
}

export class CircuitBreakerManager extends EventEmitter {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private globalCircuitBreaker: CircuitBreaker | null = null;
  private config: CircuitBreakerManagerConfig;

  constructor(config: CircuitBreakerManagerConfig) {
    super();
    this.config = config;

    if (config.enableGlobalCircuitBreaker) {
      this.initializeGlobalCircuitBreaker();
    }
  }

  /**
   * Execute agent communication with circuit breaker protection
   */
  public async executeAgentCall<T>(
    agentId: string,
    agentType: AgentType,
    fn: () => Promise<T>,
    retryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    // Get or create circuit breaker for agent
    const circuitBreaker = this.getOrCreateCircuitBreaker(agentId, agentType);
    
    // Check global circuit breaker first
    if (this.globalCircuitBreaker && this.globalCircuitBreaker.getState() === CircuitState.OPEN) {
      throw new Error('Global circuit breaker is OPEN - system is experiencing widespread failures');
    }

    // Combine retry with circuit breaker
    const finalRetryConfig = { ...this.config.defaultRetryConfig, ...retryConfig };
    
    return await RetryService.executeWithRetry(
      async () => {
        return await circuitBreaker.execute(fn);
      },
      finalRetryConfig,
      `agent-${agentId}`
    ).then(result => result.result);
  }

  /**
   * Execute agent message with circuit breaker and retry protection
   */
  public async executeAgentMessage(
    agentId: string,
    agentType: AgentType,
    message: AgentMessage,
    sendFunction: (message: AgentMessage) => Promise<AgentMessage | null>
  ): Promise<AgentMessage | null> {
    return await this.executeAgentCall(
      agentId,
      agentType,
      () => sendFunction(message),
      {
        maxAttempts: 3,
        baseDelay: 1000,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'CircuitBreakerError']
      }
    );
  }

  /**
   * Get circuit breaker metrics for an agent
   */
  public getAgentMetrics(agentId: string): AgentCircuitBreakerMetrics | null {
    const circuitBreaker = this.circuitBreakers.get(agentId);
    if (!circuitBreaker) {
      return null;
    }

    const metrics = circuitBreaker.getMetrics();
    return {
      ...metrics,
      agentId,
      agentType: this.getAgentTypeFromId(agentId)
    };
  }

  /**
   * Get metrics for all circuit breakers
   */
  public getAllMetrics(): AgentCircuitBreakerMetrics[] {
    const allMetrics: AgentCircuitBreakerMetrics[] = [];
    
    for (const [agentId, circuitBreaker] of this.circuitBreakers) {
      const metrics = circuitBreaker.getMetrics();
      allMetrics.push({
        ...metrics,
        agentId,
        agentType: this.getAgentTypeFromId(agentId)
      });
    }

    return allMetrics;
  }

  /**
   * Get global system metrics
   */
  public getGlobalMetrics(): CircuitBreakerMetrics | null {
    return this.globalCircuitBreaker?.getMetrics() || null;
  }

  /**
   * Get system health summary
   */
  public getSystemHealthSummary(): {
    totalAgents: number;
    healthyAgents: number;
    degradedAgents: number;
    failedAgents: number;
    globalState: CircuitState | null;
    averageFailureRate: number;
    averageResponseTime: number;
  } {
    const metrics = this.getAllMetrics();
    
    const summary = {
      totalAgents: metrics.length,
      healthyAgents: 0,
      degradedAgents: 0,
      failedAgents: 0,
      globalState: this.globalCircuitBreaker?.getState() || null,
      averageFailureRate: 0,
      averageResponseTime: 0
    };

    let totalFailureRate = 0;
    let totalResponseTime = 0;

    for (const metric of metrics) {
      switch (metric.state) {
        case CircuitState.CLOSED:
          if (metric.failureRate < 0.1) {
            summary.healthyAgents++;
          } else {
            summary.degradedAgents++;
          }
          break;
        case CircuitState.HALF_OPEN:
          summary.degradedAgents++;
          break;
        case CircuitState.OPEN:
          summary.failedAgents++;
          break;
      }

      totalFailureRate += metric.failureRate;
      totalResponseTime += metric.averageResponseTime;
    }

    if (metrics.length > 0) {
      summary.averageFailureRate = totalFailureRate / metrics.length;
      summary.averageResponseTime = totalResponseTime / metrics.length;
    }

    return summary;
  }

  /**
   * Reset circuit breaker for specific agent
   */
  public resetAgentCircuitBreaker(agentId: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(agentId);
    if (circuitBreaker) {
      circuitBreaker.reset();
      logger.info(`Reset circuit breaker for agent ${agentId}`);
      return true;
    }
    return false;
  }

  /**
   * Reset all circuit breakers
   */
  public resetAllCircuitBreakers(): void {
    for (const [agentId, circuitBreaker] of this.circuitBreakers) {
      circuitBreaker.reset();
    }
    
    if (this.globalCircuitBreaker) {
      this.globalCircuitBreaker.reset();
    }
    
    logger.info('Reset all circuit breakers');
  }

  /**
   * Force open circuit breaker for specific agent
   */
  public forceOpenAgentCircuitBreaker(agentId: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(agentId);
    if (circuitBreaker) {
      circuitBreaker.forceOpen();
      logger.warn(`Forced open circuit breaker for agent ${agentId}`);
      return true;
    }
    return false;
  }

  /**
   * Remove circuit breaker for agent (cleanup)
   */
  public removeAgentCircuitBreaker(agentId: string): void {
    const circuitBreaker = this.circuitBreakers.get(agentId);
    if (circuitBreaker) {
      circuitBreaker.destroy();
      this.circuitBreakers.delete(agentId);
      logger.info(`Removed circuit breaker for agent ${agentId}`);
    }
  }

  /**
   * Get or create circuit breaker for agent
   */
  private getOrCreateCircuitBreaker(agentId: string, agentType: AgentType): CircuitBreaker {
    let circuitBreaker = this.circuitBreakers.get(agentId);
    
    if (!circuitBreaker) {
      // Get agent-specific config or use default
      const agentConfig = this.config.agentSpecificConfigs?.[agentId] || {};
      const finalConfig = { ...this.config.defaultCircuitBreakerConfig, ...agentConfig };
      
      circuitBreaker = new CircuitBreaker(`agent-${agentId}`, finalConfig);
      
      // Listen to circuit breaker events
      circuitBreaker.on('state:changed', (event) => {
        logger.info(`Circuit breaker state changed for agent ${agentId}: ${event.previousState} -> ${event.currentState}`);
        this.emit('agent:circuit_breaker_state_changed', {
          agentId,
          agentType,
          ...event
        });
        
        // Update global circuit breaker if needed
        this.updateGlobalCircuitBreaker();
      });

      circuitBreaker.on('call:failure', (event) => {
        this.emit('agent:call_failure', {
          agentId,
          agentType,
          ...event
        });
      });

      circuitBreaker.on('call:success', (event) => {
        this.emit('agent:call_success', {
          agentId,
          agentType,
          ...event
        });
      });
      
      this.circuitBreakers.set(agentId, circuitBreaker);
      logger.info(`Created circuit breaker for agent ${agentId} (${agentType})`);
    }
    
    return circuitBreaker;
  }

  /**
   * Initialize global circuit breaker
   */
  private initializeGlobalCircuitBreaker(): void {
    const globalConfig: CircuitBreakerConfig = {
      ...this.config.defaultCircuitBreakerConfig,
      failureThreshold: this.config.globalFailureThreshold
    };

    this.globalCircuitBreaker = new CircuitBreaker('global-system', globalConfig);
    
    this.globalCircuitBreaker.on('state:changed', (event) => {
      logger.warn(`Global circuit breaker state changed: ${event.previousState} -> ${event.currentState}`);
      this.emit('global:circuit_breaker_state_changed', event);
    });
  }

  /**
   * Update global circuit breaker based on agent states
   */
  private updateGlobalCircuitBreaker(): void {
    if (!this.globalCircuitBreaker) {
      return;
    }

    const metrics = this.getAllMetrics();
    const failedAgents = metrics.filter(m => m.state === CircuitState.OPEN).length;
    const totalAgents = metrics.length;
    
    if (totalAgents === 0) {
      return;
    }

    const failureRate = failedAgents / totalAgents;
    
    // If more than 50% of agents are failing, trigger global circuit breaker
    if (failureRate > 0.5) {
      this.globalCircuitBreaker.forceOpen();
    } else if (failureRate < 0.1 && this.globalCircuitBreaker.getState() === CircuitState.OPEN) {
      // If failure rate is low and global is open, reset it
      this.globalCircuitBreaker.reset();
    }
  }

  /**
   * Get agent type from agent ID (simple heuristic)
   */
  private getAgentTypeFromId(agentId: string): AgentType {
    if (agentId.includes('coordinator')) return 'coordinator';
    if (agentId.includes('tutor')) return 'tutor';
    if (agentId.includes('assessment')) return 'assessment';
    if (agentId.includes('content')) return 'content';
    return 'tutor'; // default
  }

  /**
   * Cleanup all circuit breakers
   */
  public destroy(): void {
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.destroy();
    }
    this.circuitBreakers.clear();
    
    if (this.globalCircuitBreaker) {
      this.globalCircuitBreaker.destroy();
      this.globalCircuitBreaker = null;
    }
    
    this.removeAllListeners();
  }
}