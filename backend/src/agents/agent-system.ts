import { EventEmitter } from 'events';
import { BaseAgent, AgentConfig } from './base.agent.js';
import { MessageBus, MessageBusConfig } from './message-bus.js';
import { AgentRegistry } from './agent-registry.js';
import { HealthMonitor, HealthMonitorConfig } from './health-monitor.js';
import { CoordinatorAgent, CoordinatorConfig } from './coordinator.agent.js';
import { SharedContextManager } from './shared-context.js';
import { StateSynchronizer, StateSyncConfig } from './state-sync.js';
import { RedisService } from '../services/redis.service.js';
import { AgentType } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface AgentSystemConfig {
  messageBus: MessageBusConfig;
  healthMonitor: HealthMonitorConfig;
  coordinator: CoordinatorConfig;
  stateSync: StateSyncConfig;
}

export class AgentSystem extends EventEmitter {
  private config: AgentSystemConfig;
  private redisService: RedisService;
  
  // Core components
  private messageBus: MessageBus;
  private registry: AgentRegistry;
  private healthMonitor: HealthMonitor;
  private contextManager: SharedContextManager;
  private stateSynchronizer: StateSynchronizer;
  private coordinator: CoordinatorAgent;
  
  // Agent management
  private agents: Map<string, BaseAgent> = new Map();
  private isRunning: boolean = false;

  constructor(config: AgentSystemConfig, redisService: RedisService) {
    super();
    this.config = config;
    this.redisService = redisService;

    // Initialize core components
    this.messageBus = new MessageBus(config.messageBus);
    this.registry = new AgentRegistry();
    this.contextManager = new SharedContextManager(redisService);
    this.healthMonitor = new HealthMonitor(config.healthMonitor, this.registry, this.messageBus);
    this.stateSynchronizer = new StateSynchronizer(
      config.stateSync,
      this.contextManager,
      this.messageBus,
      this.registry
    );
    this.coordinator = new CoordinatorAgent(config.coordinator, this.messageBus, this.registry);

    this.setupEventListeners();
  }

  /**
   * Start the agent system
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Agent system is already running');
      return;
    }

    try {
      logger.info('Starting agent system...');

      // Start core components
      await this.messageBus.start();
      this.healthMonitor.start();

      // Register and start coordinator
      this.messageBus.registerAgent(this.coordinator);
      this.registry.registerAgent(this.coordinator);
      await this.coordinator.start();

      this.isRunning = true;
      
      logger.info('Agent system started successfully');
      this.emit('system:started');
    } catch (error) {
      logger.error('Failed to start agent system:', error);
      throw error;
    }
  }

  /**
   * Stop the agent system
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('Stopping agent system...');

      // Stop all agents
      for (const agent of this.agents.values()) {
        await this.unregisterAgent(agent.getState().agentId);
      }

      // Stop coordinator
      await this.coordinator.stop();

      // Stop core components
      this.healthMonitor.stop();
      this.stateSynchronizer.stop();
      await this.contextManager.cleanup();
      await this.messageBus.stop();
      this.registry.cleanup();

      this.isRunning = false;
      
      logger.info('Agent system stopped successfully');
      this.emit('system:stopped');
    } catch (error) {
      logger.error('Error stopping agent system:', error);
      throw error;
    }
  }

  /**
   * Register a new agent
   */
  public async registerAgent(agent: BaseAgent, metadata: Record<string, any> = {}): Promise<void> {
    const agentId = agent.getState().agentId;
    
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already registered`);
    }

    try {
      // Register with core components
      this.messageBus.registerAgent(agent);
      this.registry.registerAgent(agent, metadata);
      
      // Start the agent
      await agent.start();
      
      // Store reference
      this.agents.set(agentId, agent);
      
      logger.info(`Agent ${agentId} registered and started`);
      this.emit('agent:registered', { agentId, agentType: agent.getState().agentType });
    } catch (error) {
      logger.error(`Failed to register agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Unregister an agent
   */
  public async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger.warn(`Agent ${agentId} not found for unregistration`);
      return;
    }

    try {
      // Stop the agent
      await agent.stop();
      
      // Unregister from core components
      this.messageBus.unregisterAgent(agentId);
      this.registry.unregisterAgent(agentId);
      
      // Remove reference
      this.agents.delete(agentId);
      
      logger.info(`Agent ${agentId} unregistered`);
      this.emit('agent:unregistered', { agentId });
    } catch (error) {
      logger.error(`Failed to unregister agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get agent by ID
   */
  public getAgent(agentId: string): BaseAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get agents by type
   */
  public getAgentsByType(agentType: AgentType): BaseAgent[] {
    const agents: BaseAgent[] = [];
    for (const agent of this.agents.values()) {
      if (agent.getState().agentType === agentType) {
        agents.push(agent);
      }
    }
    return agents;
  }

  /**
   * Get all registered agents
   */
  public getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get coordinator agent
   */
  public getCoordinator(): CoordinatorAgent {
    return this.coordinator;
  }

  /**
   * Get message bus
   */
  public getMessageBus(): MessageBus {
    return this.messageBus;
  }

  /**
   * Get agent registry
   */
  public getRegistry(): AgentRegistry {
    return this.registry;
  }

  /**
   * Get health monitor
   */
  public getHealthMonitor(): HealthMonitor {
    return this.healthMonitor;
  }

  /**
   * Get context manager
   */
  public getContextManager(): SharedContextManager {
    return this.contextManager;
  }

  /**
   * Get state synchronizer
   */
  public getStateSynchronizer(): StateSynchronizer {
    return this.stateSynchronizer;
  }

  /**
   * Get system status
   */
  public getSystemStatus(): {
    isRunning: boolean;
    totalAgents: number;
    activeAgents: number;
    agentsByType: Record<AgentType, number>;
    healthSummary: any;
    coordinationStats: any;
    syncStats: any;
  } {
    const registryStats = this.registry.getStatistics();
    const healthSummary = this.healthMonitor.getHealthSummary();
    const coordinationStats = this.coordinator.getCoordinationStats();
    const syncStats = this.stateSynchronizer.getSyncStatistics();

    return {
      isRunning: this.isRunning,
      totalAgents: registryStats.totalAgents,
      activeAgents: registryStats.activeAgents,
      agentsByType: registryStats.agentsByType,
      healthSummary,
      coordinationStats,
      syncStats
    };
  }

  /**
   * Perform system health check
   */
  public async performHealthCheck(): Promise<{
    systemHealthy: boolean;
    componentHealth: Record<string, boolean>;
    agentHealth: Record<string, boolean>;
  }> {
    const componentHealth = {
      messageBus: this.messageBus !== null,
      registry: this.registry !== null,
      healthMonitor: this.healthMonitor !== null,
      contextManager: this.contextManager !== null,
      stateSynchronizer: this.stateSynchronizer !== null,
      coordinator: this.coordinator.getState().status === 'active'
    };

    const agentHealthMap = await this.messageBus.performHealthCheck();
    const agentHealth: Record<string, boolean> = {};
    
    for (const [agentId, isHealthy] of agentHealthMap) {
      agentHealth[agentId] = isHealthy;
    }

    const systemHealthy = Object.values(componentHealth).every(healthy => healthy) &&
                         Object.values(agentHealth).every(healthy => healthy);

    return {
      systemHealthy,
      componentHealth,
      agentHealth
    };
  }

  /**
   * Handle system recovery
   */
  public async recoverSystem(): Promise<void> {
    logger.info('Initiating system recovery...');

    try {
      // Check component health
      const healthCheck = await this.performHealthCheck();
      
      // Restart unhealthy components
      if (!healthCheck.componentHealth.messageBus) {
        await this.messageBus.start();
      }

      if (!healthCheck.componentHealth.healthMonitor) {
        this.healthMonitor.start();
      }

      if (!healthCheck.componentHealth.coordinator) {
        await this.coordinator.stop();
        await this.coordinator.start();
      }

      // Restart unhealthy agents
      for (const [agentId, isHealthy] of Object.entries(healthCheck.agentHealth)) {
        if (!isHealthy) {
          const agent = this.agents.get(agentId);
          if (agent) {
            try {
              await agent.stop();
              await agent.start();
              logger.info(`Recovered agent ${agentId}`);
            } catch (error) {
              logger.error(`Failed to recover agent ${agentId}:`, error);
            }
          }
        }
      }

      logger.info('System recovery completed');
      this.emit('system:recovered');
    } catch (error) {
      logger.error('System recovery failed:', error);
      this.emit('system:recovery_failed', error);
      throw error;
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Message bus events
    this.messageBus.on('message_bus:started', () => {
      logger.info('Message bus started');
    });

    this.messageBus.on('message_bus:stopped', () => {
      logger.info('Message bus stopped');
    });

    // Registry events
    this.registry.on('agent:registered', (registration) => {
      logger.info(`Agent registered: ${registration.agentId}`);
    });

    this.registry.on('agent:unregistered', (data) => {
      logger.info(`Agent unregistered: ${data.agentId}`);
    });

    // Health monitor events
    this.healthMonitor.on('agent:health_check_failed', (data) => {
      logger.warn(`Agent health check failed: ${data.agentId}`);
      this.emit('agent:unhealthy', data);
    });

    // Context manager events
    this.contextManager.on('context:initialized', (data) => {
      logger.debug(`Context initialized for session: ${data.sessionId}`);
    });

    // State synchronizer events
    this.stateSynchronizer.on('conflict:detected', (data) => {
      logger.warn(`State conflict detected: ${data.conflictId}`);
      this.emit('state:conflict', data);
    });

    // System-wide error handling
    this.on('error', (error) => {
      logger.error('Agent system error:', error);
    });
  }

  /**
   * Get system metrics
   */
  public getSystemMetrics(): {
    uptime: number;
    totalMessages: number;
    averageResponseTime: number;
    errorRate: number;
    throughput: number;
  } {
    // Basic metrics implementation
    return {
      uptime: this.isRunning ? Date.now() : 0,
      totalMessages: 0, // Would be tracked in real implementation
      averageResponseTime: 0, // Would be calculated from health monitor
      errorRate: 0, // Would be calculated from error tracking
      throughput: 0 // Would be calculated from message processing
    };
  }
}