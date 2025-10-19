import { EventEmitter } from 'events';
import { BaseAgent, AgentMessage } from './base.agent.js';
import { AgentType } from '../types/index.js';
import { CircuitBreakerManager } from '../services/circuit-breaker-manager.service.js';
import { logger } from '../utils/logger.js';

export interface MessageRoute {
  from: string;
  to: string;
  messageType: string;
  priority: number;
}

export interface MessageBusConfig {
  maxQueueSize: number;
  messageTimeout: number;
  retryAttempts: number;
  retryDelay: number;
}

export class MessageBus extends EventEmitter {
  private agents: Map<string, BaseAgent> = new Map();
  private messageQueue: AgentMessage[] = [];
  private pendingMessages: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  private config: MessageBusConfig;
  private isProcessing: boolean = false;
  private circuitBreakerManager: CircuitBreakerManager | null = null;

  constructor(config: MessageBusConfig, circuitBreakerManager?: CircuitBreakerManager) {
    super();
    this.config = config;
    this.circuitBreakerManager = circuitBreakerManager || null;
  }

  /**
   * Register an agent with the message bus
   */
  public registerAgent(agent: BaseAgent): void {
    const agentId = agent.getState().agentId;
    
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already registered`);
    }

    this.agents.set(agentId, agent);
    
    // Listen to agent events
    agent.on('agent:started', (data) => {
      logger.info(`Agent ${data.agentId} registered and started`);
      this.emit('agent:registered', data);
    });

    agent.on('agent:stopped', (data) => {
      logger.info(`Agent ${data.agentId} stopped`);
      this.emit('agent:unregistered', data);
    });

    agent.on('agent:status_changed', (data) => {
      this.emit('agent:status_changed', data);
    });

    agent.on('agent:health_check_failed', (data) => {
      logger.warn(`Agent ${data.agentId} health check failed`);
      this.emit('agent:health_check_failed', data);
    });

    logger.info(`Agent ${agentId} registered with message bus`);
  }

  /**
   * Unregister an agent from the message bus
   */
  public unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.removeAllListeners();
      this.agents.delete(agentId);
      logger.info(`Agent ${agentId} unregistered from message bus`);
      this.emit('agent:unregistered', { agentId });
    }
  }

  /**
   * Send a message to a specific agent
   */
  public async sendMessage(message: AgentMessage): Promise<AgentMessage | null> {
    if (this.messageQueue.length >= this.config.maxQueueSize) {
      throw new Error('Message queue is full');
    }

    // Use circuit breaker if available
    if (this.circuitBreakerManager && message.to !== 'all') {
      const targetAgent = this.agents.get(message.to);
      if (targetAgent) {
        const agentState = targetAgent.getState();
        return await this.circuitBreakerManager.executeAgentMessage(
          message.to,
          agentState.agentType,
          message,
          (msg) => this.sendMessageDirect(msg)
        );
      }
    }

    return await this.sendMessageDirect(message);
  }

  /**
   * Send message directly without circuit breaker protection
   */
  private async sendMessageDirect(message: AgentMessage): Promise<AgentMessage | null> {
    if (this.messageQueue.length >= this.config.maxQueueSize) {
      throw new Error('Message queue is full');
    }

    // Add message to queue
    this.messageQueue.push(message);
    
    // Start processing if not already processing
    if (!this.isProcessing) {
      this.processMessageQueue();
    }

    // If this is a request, wait for response
    if (message.type === 'request') {
      return this.waitForResponse(message);
    }

    return null;
  }

  /**
   * Broadcast a message to all agents
   */
  public async broadcastMessage(message: Omit<AgentMessage, 'to'>): Promise<void> {
    const broadcastMessage: AgentMessage = {
      ...message,
      to: 'all'
    };

    for (const [agentId, agent] of this.agents) {
      if (agentId !== message.from && agent.getState().status === 'active') {
        try {
          await agent.processMessage(broadcastMessage);
        } catch (error) {
          logger.error(`Failed to broadcast message to agent ${agentId}:`, error);
        }
      }
    }
  }

  /**
   * Send a message to agents by type
   */
  public async sendToAgentType(agentType: AgentType, message: Omit<AgentMessage, 'to'>): Promise<AgentMessage[]> {
    const responses: AgentMessage[] = [];
    
    for (const [agentId, agent] of this.agents) {
      const agentState = agent.getState();
      if (agentState.agentType === agentType && agentState.status === 'active') {
        try {
          const response = await agent.processMessage({ ...message, to: agentId });
          if (response) {
            responses.push(response);
          }
        } catch (error) {
          logger.error(`Failed to send message to agent ${agentId}:`, error);
        }
      }
    }

    return responses;
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
   * Get agent states
   */
  public getAgentStates(): Map<string, any> {
    const states = new Map();
    for (const [agentId, agent] of this.agents) {
      states.set(agentId, agent.getState());
    }
    return states;
  }

  /**
   * Check if agent exists and is healthy
   */
  public isAgentHealthy(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    
    const state = agent.getState();
    return state.status === 'active' || state.status === 'busy';
  }

  /**
   * Perform health check on all agents
   */
  public async performHealthCheck(): Promise<Map<string, boolean>> {
    const healthStatus = new Map<string, boolean>();
    
    for (const [agentId, agent] of this.agents) {
      try {
        const healthMessage: AgentMessage = {
          id: `health-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          from: 'message-bus',
          to: agentId,
          type: 'health_check',
          payload: {},
          timestamp: new Date()
        };

        const response = await agent.processMessage(healthMessage);
        healthStatus.set(agentId, response?.payload?.healthy || false);
      } catch (error) {
        logger.error(`Health check failed for agent ${agentId}:`, error);
        healthStatus.set(agentId, false);
      }
    }

    return healthStatus;
  }

  /**
   * Process message queue
   */
  private async processMessageQueue(): Promise<void> {
    if (this.isProcessing || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      
      try {
        await this.deliverMessage(message);
      } catch (error) {
        logger.error(`Failed to deliver message ${message.id}:`, error);
        this.emit('message:delivery_failed', { message, error });
      }
    }

    this.isProcessing = false;
  }

  /**
   * Deliver message to target agent
   */
  private async deliverMessage(message: AgentMessage): Promise<void> {
    if (message.to === 'all') {
      await this.broadcastMessage(message);
      return;
    }

    const targetAgent = this.agents.get(message.to);
    if (!targetAgent) {
      throw new Error(`Target agent ${message.to} not found`);
    }

    const response = await targetAgent.processMessage(message);
    
    if (response && message.type === 'request') {
      this.resolveResponse(message.id, response);
    }

    this.emit('message:delivered', { message, response });
  }

  /**
   * Wait for response to a request message
   */
  private waitForResponse(message: AgentMessage): Promise<AgentMessage | null> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(message.id);
        reject(new Error(`Message ${message.id} timed out`));
      }, this.config.messageTimeout);

      this.pendingMessages.set(message.id, { resolve, reject, timeout });
    });
  }

  /**
   * Resolve pending response
   */
  private resolveResponse(messageId: string, response: AgentMessage): void {
    const pending = this.pendingMessages.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingMessages.delete(messageId);
      pending.resolve(response);
    }
  }

  /**
   * Start the message bus
   */
  public async start(): Promise<void> {
    logger.info('Message bus started');
    this.emit('message_bus:started');
  }

  /**
   * Stop the message bus
   */
  public async stop(): Promise<void> {
    // Clear pending messages
    for (const [messageId, pending] of this.pendingMessages) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Message bus stopped'));
    }
    this.pendingMessages.clear();

    // Stop all agents
    for (const agent of this.agents.values()) {
      try {
        await agent.stop();
      } catch (error) {
        logger.error('Error stopping agent:', error);
      }
    }

    this.agents.clear();
    this.messageQueue.length = 0;
    
    logger.info('Message bus stopped');
    this.emit('message_bus:stopped');
  }
}