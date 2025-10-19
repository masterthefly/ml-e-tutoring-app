import { EventEmitter } from 'events';
import { BaseAgent } from './base.agent.js';
import { AgentRegistry } from './agent-registry.js';
import { MessageBus } from './message-bus.js';
import { logger } from '../utils/logger.js';

export interface HealthMetrics {
  agentId: string;
  isHealthy: boolean;
  responseTime: number;
  uptime: number;
  currentTasks: number;
  maxTasks: number;
  memoryUsage?: number;
  cpuUsage?: number;
  lastHealthCheck: Date;
  errorCount: number;
  successCount: number;
}

export interface HealthMonitorConfig {
  checkInterval: number;
  timeout: number;
  maxRetries: number;
  alertThreshold: number;
  metricsRetentionPeriod: number;
}

export class HealthMonitor extends EventEmitter {
  private config: HealthMonitorConfig;
  private registry: AgentRegistry;
  private messageBus: MessageBus;
  private metrics: Map<string, HealthMetrics[]> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(
    config: HealthMonitorConfig,
    registry: AgentRegistry,
    messageBus: MessageBus
  ) {
    super();
    this.config = config;
    this.registry = registry;
    this.messageBus = messageBus;

    // Listen to registry events
    this.registry.on('agent:registered', (registration) => {
      this.initializeMetrics(registration.agentId);
    });

    this.registry.on('agent:unregistered', (data) => {
      this.cleanupMetrics(data.agentId);
    });
  }

  /**
   * Start health monitoring
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Health monitor is already running');
      return;
    }

    this.isRunning = true;
    this.monitoringInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.checkInterval);

    logger.info('Health monitor started');
    this.emit('monitor:started');
  }

  /**
   * Stop health monitoring
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

    logger.info('Health monitor stopped');
    this.emit('monitor:stopped');
  }

  /**
   * Get health metrics for an agent
   */
  public getAgentMetrics(agentId: string): HealthMetrics[] {
    return this.metrics.get(agentId) || [];
  }

  /**
   * Get latest health metrics for an agent
   */
  public getLatestMetrics(agentId: string): HealthMetrics | null {
    const agentMetrics = this.metrics.get(agentId);
    if (!agentMetrics || agentMetrics.length === 0) {
      return null;
    }
    return agentMetrics[agentMetrics.length - 1];
  }

  /**
   * Get health summary for all agents
   */
  public getHealthSummary(): {
    totalAgents: number;
    healthyAgents: number;
    unhealthyAgents: number;
    averageResponseTime: number;
    agentStatuses: Record<string, boolean>;
  } {
    const activeAgents = this.registry.getActiveAgents();
    const summary = {
      totalAgents: activeAgents.length,
      healthyAgents: 0,
      unhealthyAgents: 0,
      averageResponseTime: 0,
      agentStatuses: {} as Record<string, boolean>
    };

    let totalResponseTime = 0;
    let responseTimeCount = 0;

    for (const agent of activeAgents) {
      const latestMetrics = this.getLatestMetrics(agent.agentId);
      const isHealthy = latestMetrics?.isHealthy || false;
      
      summary.agentStatuses[agent.agentId] = isHealthy;
      
      if (isHealthy) {
        summary.healthyAgents++;
      } else {
        summary.unhealthyAgents++;
      }

      if (latestMetrics) {
        totalResponseTime += latestMetrics.responseTime;
        responseTimeCount++;
      }
    }

    if (responseTimeCount > 0) {
      summary.averageResponseTime = totalResponseTime / responseTimeCount;
    }

    return summary;
  }

  /**
   * Check if agent is healthy
   */
  public async checkAgentHealth(agentId: string): Promise<HealthMetrics | null> {
    const agent = this.messageBus.getAgent(agentId);
    if (!agent) {
      return null;
    }

    const startTime = Date.now();
    
    try {
      const healthMessage = {
        id: `health-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        from: 'health-monitor',
        to: agentId,
        type: 'health_check' as const,
        payload: {},
        timestamp: new Date()
      };

      const response = await Promise.race([
        this.messageBus.sendMessage(healthMessage),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), this.config.timeout)
        )
      ]);

      const responseTime = Date.now() - startTime;
      const agentState = agent.getState();

      const metrics: HealthMetrics = {
        agentId,
        isHealthy: true,
        responseTime,
        uptime: Date.now() - agentState.lastUpdated.getTime(),
        currentTasks: (response as any)?.payload?.currentTasks || 0,
        maxTasks: (response as any)?.payload?.maxTasks || 1,
        lastHealthCheck: new Date(),
        errorCount: this.getErrorCount(agentId),
        successCount: this.getSuccessCount(agentId) + 1
      };

      this.recordMetrics(agentId, metrics);
      this.registry.updateAgentLastSeen(agentId);
      
      return metrics;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      const metrics: HealthMetrics = {
        agentId,
        isHealthy: false,
        responseTime,
        uptime: 0,
        currentTasks: 0,
        maxTasks: 1,
        lastHealthCheck: new Date(),
        errorCount: this.getErrorCount(agentId) + 1,
        successCount: this.getSuccessCount(agentId)
      };

      this.recordMetrics(agentId, metrics);
      
      logger.error(`Health check failed for agent ${agentId}:`, error);
      this.emit('agent:health_check_failed', { agentId, error, metrics });
      
      return metrics;
    }
  }

  /**
   * Get agents that are unhealthy
   */
  public getUnhealthyAgents(): string[] {
    const unhealthyAgents: string[] = [];
    
    for (const agent of this.registry.getActiveAgents()) {
      const latestMetrics = this.getLatestMetrics(agent.agentId);
      if (!latestMetrics || !latestMetrics.isHealthy) {
        unhealthyAgents.push(agent.agentId);
      }
    }

    return unhealthyAgents;
  }

  /**
   * Get agents with high error rates
   */
  public getHighErrorRateAgents(): string[] {
    const highErrorAgents: string[] = [];
    
    for (const agent of this.registry.getActiveAgents()) {
      const errorRate = this.calculateErrorRate(agent.agentId);
      if (errorRate > this.config.alertThreshold) {
        highErrorAgents.push(agent.agentId);
      }
    }

    return highErrorAgents;
  }

  /**
   * Calculate error rate for an agent
   */
  public calculateErrorRate(agentId: string): number {
    const agentMetrics = this.metrics.get(agentId);
    if (!agentMetrics || agentMetrics.length === 0) {
      return 0;
    }

    const latestMetrics = agentMetrics[agentMetrics.length - 1];
    const totalChecks = latestMetrics.errorCount + latestMetrics.successCount;
    
    if (totalChecks === 0) {
      return 0;
    }

    return latestMetrics.errorCount / totalChecks;
  }

  /**
   * Perform health checks on all active agents
   */
  private async performHealthChecks(): Promise<void> {
    const activeAgents = this.registry.getActiveAgents();
    
    logger.debug(`Performing health checks on ${activeAgents.length} agents`);

    const healthCheckPromises = activeAgents.map(agent => 
      this.checkAgentHealth(agent.agentId).catch(error => {
        logger.error(`Health check error for agent ${agent.agentId}:`, error);
        return null;
      })
    );

    await Promise.all(healthCheckPromises);
    
    // Clean up old metrics
    this.cleanupOldMetrics();
    
    // Emit health summary
    const summary = this.getHealthSummary();
    this.emit('health:summary', summary);
  }

  /**
   * Initialize metrics for a new agent
   */
  private initializeMetrics(agentId: string): void {
    if (!this.metrics.has(agentId)) {
      this.metrics.set(agentId, []);
    }
  }

  /**
   * Cleanup metrics for an agent
   */
  private cleanupMetrics(agentId: string): void {
    this.metrics.delete(agentId);
  }

  /**
   * Record metrics for an agent
   */
  private recordMetrics(agentId: string, metrics: HealthMetrics): void {
    if (!this.metrics.has(agentId)) {
      this.metrics.set(agentId, []);
    }

    const agentMetrics = this.metrics.get(agentId)!;
    agentMetrics.push(metrics);

    // Keep only recent metrics
    const maxMetrics = Math.floor(this.config.metricsRetentionPeriod / this.config.checkInterval);
    if (agentMetrics.length > maxMetrics) {
      agentMetrics.splice(0, agentMetrics.length - maxMetrics);
    }
  }

  /**
   * Get error count for an agent
   */
  private getErrorCount(agentId: string): number {
    const latestMetrics = this.getLatestMetrics(agentId);
    return latestMetrics?.errorCount || 0;
  }

  /**
   * Get success count for an agent
   */
  private getSuccessCount(agentId: string): number {
    const latestMetrics = this.getLatestMetrics(agentId);
    return latestMetrics?.successCount || 0;
  }

  /**
   * Clean up old metrics
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - this.config.metricsRetentionPeriod;
    
    for (const [agentId, agentMetrics] of this.metrics) {
      const filteredMetrics = agentMetrics.filter(
        metrics => metrics.lastHealthCheck.getTime() > cutoffTime
      );
      
      if (filteredMetrics.length !== agentMetrics.length) {
        this.metrics.set(agentId, filteredMetrics);
      }
    }
  }
}