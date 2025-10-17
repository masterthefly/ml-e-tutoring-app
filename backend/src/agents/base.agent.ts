import { EventEmitter } from 'events';
import { AgentState, AgentType, Message, MessageMetadata } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'broadcast' | 'health_check';
  payload: any;
  timestamp: Date;
  correlationId?: string;
}

export interface AgentCapability {
  name: string;
  description: string;
  inputTypes: string[];
  outputTypes: string[];
}

export interface AgentConfig {
  id: string;
  type: AgentType;
  capabilities: AgentCapability[];
  maxConcurrentTasks: number;
  healthCheckInterval: number;
}

export abstract class BaseAgent extends EventEmitter {
  protected config: AgentConfig;
  protected state: AgentState;
  protected isRunning: boolean = false;
  protected healthCheckTimer?: NodeJS.Timeout;
  protected currentTasks: Set<string> = new Set();

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.state = {
      agentId: config.id,
      agentType: config.type,
      sessionId: '',
      context: {},
      lastAction: 'initialized',
      status: 'idle',
      capabilities: config.capabilities.map(cap => cap.name),
      lastUpdated: new Date()
    };
  }

  /**
   * Start the agent and begin health monitoring
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn(`Agent ${this.config.id} is already running`);
      return;
    }

    try {
      await this.initialize();
      this.isRunning = true;
      this.updateStatus('active');
      this.startHealthMonitoring();
      
      logger.info(`Agent ${this.config.id} started successfully`);
      this.emit('agent:started', { agentId: this.config.id });
    } catch (error) {
      logger.error(`Failed to start agent ${this.config.id}:`, error);
      this.updateStatus('error');
      throw error;
    }
  }

  /**
   * Stop the agent and cleanup resources
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.stopHealthMonitoring();
      await this.cleanup();
      this.isRunning = false;
      this.updateStatus('idle');
      
      logger.info(`Agent ${this.config.id} stopped successfully`);
      this.emit('agent:stopped', { agentId: this.config.id });
    } catch (error) {
      logger.error(`Error stopping agent ${this.config.id}:`, error);
      throw error;
    }
  }

  /**
   * Process incoming message
   */
  public async processMessage(message: AgentMessage): Promise<AgentMessage | null> {
    if (!this.isRunning) {
      throw new Error(`Agent ${this.config.id} is not running`);
    }

    if (this.currentTasks.size >= this.config.maxConcurrentTasks) {
      throw new Error(`Agent ${this.config.id} is at maximum capacity`);
    }

    const taskId = `${message.id}-${Date.now()}`;
    this.currentTasks.add(taskId);
    this.updateStatus('busy');

    try {
      logger.debug(`Agent ${this.config.id} processing message ${message.id}`);
      
      let response: AgentMessage | null = null;
      
      switch (message.type) {
        case 'health_check':
          response = this.handleHealthCheck(message);
          break;
        case 'request':
          response = await this.handleRequest(message);
          break;
        case 'broadcast':
          await this.handleBroadcast(message);
          break;
        default:
          logger.warn(`Unknown message type: ${message.type}`);
      }

      this.updateLastAction(`processed_${message.type}`);
      return response;
    } catch (error) {
      logger.error(`Error processing message in agent ${this.config.id}:`, error);
      this.updateStatus('error');
      throw error;
    } finally {
      this.currentTasks.delete(taskId);
      if (this.currentTasks.size === 0) {
        this.updateStatus('active');
      }
    }
  }

  /**
   * Get current agent state
   */
  public getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Update agent context
   */
  public updateContext(sessionId: string, context: Record<string, any>): void {
    this.state.sessionId = sessionId;
    this.state.context = { ...this.state.context, ...context };
    this.state.lastUpdated = new Date();
  }

  /**
   * Check if agent can handle a specific capability
   */
  public hasCapability(capability: string): boolean {
    return this.state.capabilities.includes(capability);
  }

  /**
   * Get agent capabilities
   */
  public getCapabilities(): AgentCapability[] {
    return [...this.config.capabilities];
  }

  /**
   * Create a response message
   */
  protected createResponse(originalMessage: AgentMessage, payload: any): AgentMessage {
    return {
      id: `${this.config.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from: this.config.id,
      to: originalMessage.from,
      type: 'response',
      payload,
      timestamp: new Date(),
      correlationId: originalMessage.id
    };
  }

  /**
   * Create a broadcast message
   */
  protected createBroadcast(payload: any): AgentMessage {
    return {
      id: `${this.config.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from: this.config.id,
      to: 'all',
      type: 'broadcast',
      payload,
      timestamp: new Date()
    };
  }

  /**
   * Update agent status
   */
  protected updateStatus(status: AgentState['status']): void {
    this.state.status = status;
    this.state.lastUpdated = new Date();
    this.emit('agent:status_changed', { 
      agentId: this.config.id, 
      status,
      timestamp: this.state.lastUpdated 
    });
  }

  /**
   * Update last action
   */
  protected updateLastAction(action: string): void {
    this.state.lastAction = action;
    this.state.lastUpdated = new Date();
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Perform health check
   */
  private performHealthCheck(): void {
    try {
      const isHealthy = this.checkHealth();
      if (!isHealthy) {
        this.updateStatus('error');
        this.emit('agent:health_check_failed', { agentId: this.config.id });
      }
    } catch (error) {
      logger.error(`Health check failed for agent ${this.config.id}:`, error);
      this.updateStatus('error');
      this.emit('agent:health_check_failed', { agentId: this.config.id });
    }
  }

  /**
   * Handle health check message
   */
  private handleHealthCheck(message: AgentMessage): AgentMessage {
    const isHealthy = this.checkHealth();
    return this.createResponse(message, {
      healthy: isHealthy,
      status: this.state.status,
      uptime: this.isRunning ? Date.now() - this.state.lastUpdated.getTime() : 0,
      currentTasks: this.currentTasks.size,
      maxTasks: this.config.maxConcurrentTasks
    });
  }

  // Abstract methods that must be implemented by concrete agents
  protected abstract initialize(): Promise<void>;
  protected abstract cleanup(): Promise<void>;
  protected abstract handleRequest(message: AgentMessage): Promise<AgentMessage | null>;
  protected abstract handleBroadcast(message: AgentMessage): Promise<void>;
  protected abstract checkHealth(): boolean;
}