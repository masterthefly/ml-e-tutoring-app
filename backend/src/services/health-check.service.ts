import { EventEmitter } from 'events';
import { AgentRegistry } from '../agents/agent-registry.js';
import { MessageBus } from '../agents/message-bus.js';
import { CircuitBreakerManager } from './circuit-breaker-manager.service.js';
import { logger } from '../utils/logger.js';

export interface HealthCheckConfig {
  checkInterval: number;
  timeout: number;
  criticalServices: string[];
  warningThresholds: {
    responseTime: number;
    errorRate: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  lastCheck: Date;
  error?: string;
  metadata?: Record<string, any>;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: ServiceHealth[];
  agents: AgentHealthSummary;
  circuitBreakers: CircuitBreakerHealthSummary;
  system: SystemMetrics;
  uptime: number;
}

export interface AgentHealthSummary {
  total: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  details: Array<{
    agentId: string;
    agentType: string;
    status: string;
    responseTime: number;
  }>;
}

export interface CircuitBreakerHealthSummary {
  total: number;
  closed: number;
  halfOpen: number;
  open: number;
  globalState: string | null;
  averageFailureRate: number;
}

export interface SystemMetrics {
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cpuUsage: number;
  processUptime: number;
  nodeVersion: string;
}

export class HealthCheckService extends EventEmitter {
  private config: HealthCheckConfig;
  private registry: AgentRegistry;
  private messageBus: MessageBus;
  private circuitBreakerManager: CircuitBreakerManager;
  private startTime: Date = new Date();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastHealthCheck: SystemHealth | null = null;

  constructor(
    config: HealthCheckConfig,
    registry: AgentRegistry,
    messageBus: MessageBus,
    circuitBreakerManager: CircuitBreakerManager
  ) {
    super();
    this.config = config;
    this.registry = registry;
    this.messageBus = messageBus;
    this.circuitBreakerManager = circuitBreakerManager;
  }

  /**
   * Start health monitoring
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Health check service is already running');
      return;
    }

    this.isRunning = true;
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.checkInterval);

    logger.info('Health check service started');
    this.emit('health_check:started');
  }

  /**
   * Stop health monitoring
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    logger.info('Health check service stopped');
    this.emit('health_check:stopped');
  }

  /**
   * Get current system health
   */
  public async getCurrentHealth(): Promise<SystemHealth> {
    return await this.performHealthCheck();
  }

  /**
   * Get last cached health check result
   */
  public getLastHealth(): SystemHealth | null {
    return this.lastHealthCheck;
  }

  /**
   * Check health of a specific service
   */
  public async checkServiceHealth(serviceName: string): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      let health: ServiceHealth;
      
      switch (serviceName) {
        case 'database':
          health = await this.checkDatabaseHealth();
          break;
        case 'redis':
          health = await this.checkRedisHealth();
          break;
        case 'message_bus':
          health = await this.checkMessageBusHealth();
          break;
        case 'agent_registry':
          health = await this.checkAgentRegistryHealth();
          break;
        case 'circuit_breakers':
          health = await this.checkCircuitBreakerHealth();
          break;
        default:
          throw new Error(`Unknown service: ${serviceName}`);
      }
      
      health.responseTime = Date.now() - startTime;
      health.lastCheck = new Date();
      
      return health;
    } catch (error) {
      return {
        name: serviceName,
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        error: (error as Error).message
      };
    }
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<SystemHealth> {
    const startTime = Date.now();
    
    try {
      // Check all services
      const serviceChecks = [
        this.checkServiceHealth('database'),
        this.checkServiceHealth('redis'),
        this.checkServiceHealth('message_bus'),
        this.checkServiceHealth('agent_registry'),
        this.checkServiceHealth('circuit_breakers')
      ];

      const services = await Promise.all(serviceChecks);
      
      // Get agent health summary
      const agents = await this.getAgentHealthSummary();
      
      // Get circuit breaker health summary
      const circuitBreakers = this.getCircuitBreakerHealthSummary();
      
      // Get system metrics
      const system = this.getSystemMetrics();
      
      // Determine overall system status
      const status = this.determineSystemStatus(services, agents, circuitBreakers);
      
      const health: SystemHealth = {
        status,
        timestamp: new Date(),
        services,
        agents,
        circuitBreakers,
        system,
        uptime: Date.now() - this.startTime.getTime()
      };

      this.lastHealthCheck = health;
      
      // Emit health check event
      this.emit('health_check:completed', health);
      
      // Log health status changes
      if (status !== 'healthy') {
        logger.warn(`System health status: ${status}`);
      }
      
      return health;
    } catch (error) {
      logger.error('Health check failed:', error);
      
      const health: SystemHealth = {
        status: 'unhealthy',
        timestamp: new Date(),
        services: [],
        agents: { total: 0, healthy: 0, degraded: 0, unhealthy: 0, details: [] },
        circuitBreakers: { total: 0, closed: 0, halfOpen: 0, open: 0, globalState: null, averageFailureRate: 0 },
        system: this.getSystemMetrics(),
        uptime: Date.now() - this.startTime.getTime()
      };
      
      this.lastHealthCheck = health;
      return health;
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<ServiceHealth> {
    // This would typically check database connection
    // For now, we'll simulate a basic check
    return {
      name: 'database',
      status: 'healthy',
      responseTime: 0,
      lastCheck: new Date(),
      metadata: {
        connectionPool: 'active',
        activeConnections: 5
      }
    };
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<ServiceHealth> {
    // This would typically check Redis connection
    // For now, we'll simulate a basic check
    return {
      name: 'redis',
      status: 'healthy',
      responseTime: 0,
      lastCheck: new Date(),
      metadata: {
        connectionStatus: 'connected',
        memoryUsage: '10MB'
      }
    };
  }

  /**
   * Check message bus health
   */
  private async checkMessageBusHealth(): Promise<ServiceHealth> {
    try {
      const agents = this.messageBus.getAllAgents();
      const healthStatus = await this.messageBus.performHealthCheck();
      
      const healthyAgents = Array.from(healthStatus.values()).filter(Boolean).length;
      const totalAgents = healthStatus.size;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (totalAgents === 0) {
        status = 'unhealthy';
      } else if (healthyAgents / totalAgents < 0.8) {
        status = 'degraded';
      }
      
      return {
        name: 'message_bus',
        status,
        responseTime: 0,
        lastCheck: new Date(),
        metadata: {
          totalAgents,
          healthyAgents,
          queueSize: 0 // Would get from actual message bus
        }
      };
    } catch (error) {
      return {
        name: 'message_bus',
        status: 'unhealthy',
        responseTime: 0,
        lastCheck: new Date(),
        error: (error as Error).message
      };
    }
  }

  /**
   * Check agent registry health
   */
  private async checkAgentRegistryHealth(): Promise<ServiceHealth> {
    try {
      const activeAgents = this.registry.getActiveAgents();
      const totalAgents = this.registry.getAllAgents();
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (totalAgents.length === 0) {
        status = 'unhealthy';
      } else if (activeAgents.length / totalAgents.length < 0.8) {
        status = 'degraded';
      }
      
      return {
        name: 'agent_registry',
        status,
        responseTime: 0,
        lastCheck: new Date(),
        metadata: {
          totalAgents: totalAgents.length,
          activeAgents: activeAgents.length
        }
      };
    } catch (error) {
      return {
        name: 'agent_registry',
        status: 'unhealthy',
        responseTime: 0,
        lastCheck: new Date(),
        error: (error as Error).message
      };
    }
  }

  /**
   * Check circuit breaker health
   */
  private async checkCircuitBreakerHealth(): Promise<ServiceHealth> {
    try {
      const summary = this.circuitBreakerManager.getSystemHealthSummary();
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (summary.failedAgents > 0) {
        status = summary.failedAgents / summary.totalAgents > 0.5 ? 'unhealthy' : 'degraded';
      } else if (summary.degradedAgents > 0) {
        status = 'degraded';
      }
      
      return {
        name: 'circuit_breakers',
        status,
        responseTime: 0,
        lastCheck: new Date(),
        metadata: {
          totalAgents: summary.totalAgents,
          healthyAgents: summary.healthyAgents,
          degradedAgents: summary.degradedAgents,
          failedAgents: summary.failedAgents,
          averageFailureRate: summary.averageFailureRate
        }
      };
    } catch (error) {
      return {
        name: 'circuit_breakers',
        status: 'unhealthy',
        responseTime: 0,
        lastCheck: new Date(),
        error: (error as Error).message
      };
    }
  }

  /**
   * Get agent health summary
   */
  private async getAgentHealthSummary(): Promise<AgentHealthSummary> {
    const activeAgents = this.registry.getActiveAgents();
    
    const summary: AgentHealthSummary = {
      total: activeAgents.length,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      details: []
    };

    for (const agent of activeAgents) {
      let status = 'healthy';
      let responseTime = 0;
      
      // Check circuit breaker status for agent
      const cbMetrics = this.circuitBreakerManager.getAgentMetrics(agent.agentId);
      if (cbMetrics) {
        responseTime = cbMetrics.averageResponseTime;
        if (cbMetrics.state === 'OPEN') {
          status = 'unhealthy';
          summary.unhealthy++;
        } else if (cbMetrics.state === 'HALF_OPEN' || cbMetrics.failureRate > 0.1) {
          status = 'degraded';
          summary.degraded++;
        } else {
          summary.healthy++;
        }
      } else {
        summary.healthy++;
      }
      
      summary.details.push({
        agentId: agent.agentId,
        agentType: agent.agentType,
        status,
        responseTime
      });
    }

    return summary;
  }

  /**
   * Get circuit breaker health summary
   */
  private getCircuitBreakerHealthSummary(): CircuitBreakerHealthSummary {
    const systemSummary = this.circuitBreakerManager.getSystemHealthSummary();
    const globalMetrics = this.circuitBreakerManager.getGlobalMetrics();
    
    return {
      total: systemSummary.totalAgents,
      closed: systemSummary.healthyAgents,
      halfOpen: systemSummary.degradedAgents,
      open: systemSummary.failedAgents,
      globalState: globalMetrics?.state || null,
      averageFailureRate: systemSummary.averageFailureRate
    };
  }

  /**
   * Get system metrics
   */
  private getSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    
    return {
      memoryUsage: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
      },
      cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
      processUptime: process.uptime(),
      nodeVersion: process.version
    };
  }

  /**
   * Determine overall system status
   */
  private determineSystemStatus(
    services: ServiceHealth[],
    agents: AgentHealthSummary,
    circuitBreakers: CircuitBreakerHealthSummary
  ): 'healthy' | 'degraded' | 'unhealthy' {
    // Check critical services
    const criticalServiceFailures = services.filter(
      service => this.config.criticalServices.includes(service.name) && service.status === 'unhealthy'
    );
    
    if (criticalServiceFailures.length > 0) {
      return 'unhealthy';
    }
    
    // Check if any service is unhealthy
    const unhealthyServices = services.filter(service => service.status === 'unhealthy');
    if (unhealthyServices.length > 0) {
      return 'degraded';
    }
    
    // Check agent health
    if (agents.total > 0) {
      const healthyAgentRatio = agents.healthy / agents.total;
      if (healthyAgentRatio < 0.5) {
        return 'unhealthy';
      } else if (healthyAgentRatio < 0.8) {
        return 'degraded';
      }
    }
    
    // Check circuit breaker status
    if (circuitBreakers.globalState === 'OPEN') {
      return 'unhealthy';
    }
    
    if (circuitBreakers.total > 0 && circuitBreakers.open / circuitBreakers.total > 0.3) {
      return 'degraded';
    }
    
    // Check for degraded services
    const degradedServices = services.filter(service => service.status === 'degraded');
    if (degradedServices.length > 0 || agents.degraded > 0) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stop();
    this.removeAllListeners();
  }
}