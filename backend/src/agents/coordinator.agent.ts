import { BaseAgent, AgentMessage, AgentConfig, AgentCapability } from './base.agent.js';
import { MessageBus } from './message-bus.js';
import { AgentRegistry } from './agent-registry.js';
import { ResilienceManager } from '../services/resilience-manager.service.js';
import { AgentType, Message, MessageMetadata } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface CoordinatorConfig extends AgentConfig {
  routingRules: RoutingRule[];
  fallbackStrategy: 'round_robin' | 'random' | 'least_busy';
  maxRetries: number;
  retryDelay: number;
}

export interface RoutingRule {
  condition: RoutingCondition;
  targetAgentType: AgentType;
  priority: number;
  fallbackTypes?: AgentType[];
}

export interface RoutingCondition {
  messageType?: string;
  keywords?: string[];
  capability?: string;
  sessionContext?: Record<string, any>;
}

export interface CoordinationRequest {
  sessionId: string;
  studentMessage: Message;
  context: Record<string, any>;
  requiresMultipleAgents?: boolean;
  priority?: number;
}

export interface CoordinationResponse {
  responses: AgentResponse[];
  aggregatedResponse: Message;
  involvedAgents: string[];
  processingTime: number;
  success: boolean;
  errors?: string[];
}

export interface AgentResponse {
  agentId: string;
  agentType: AgentType;
  response: Message;
  processingTime: number;
  success: boolean;
  error?: string;
}

export class CoordinatorAgent extends BaseAgent {
  private messageBus: MessageBus;
  private registry: AgentRegistry;
  private coordinatorConfig: CoordinatorConfig;
  private resilienceManager: ResilienceManager | null = null;
  private activeCoordinations: Map<string, CoordinationRequest> = new Map();
  private routingStats: Map<AgentType, { requests: number; successes: number; failures: number }> = new Map();

  constructor(
    config: CoordinatorConfig,
    messageBus: MessageBus,
    registry: AgentRegistry,
    resilienceManager?: ResilienceManager
  ) {
    super(config);
    this.coordinatorConfig = config;
    this.messageBus = messageBus;
    this.registry = registry;
    this.resilienceManager = resilienceManager || null;

    // Initialize routing stats
    this.initializeRoutingStats();
  }

  /**
   * Coordinate a student request across multiple agents
   */
  public async coordinateRequest(request: CoordinationRequest): Promise<CoordinationResponse> {
    const startTime = Date.now();
    const coordinationId = `coord-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.activeCoordinations.set(coordinationId, request);
    
    try {
      logger.info(`Coordinating request ${coordinationId} for session ${request.sessionId}`);
      
      // Determine routing strategy
      const routingPlan = this.createRoutingPlan(request);
      
      // Execute routing plan
      const responses = await this.executeRoutingPlan(routingPlan, request);
      
      // Aggregate responses
      const aggregatedResponse = this.aggregateResponses(responses, request);
      
      const processingTime = Date.now() - startTime;
      
      const coordinationResponse: CoordinationResponse = {
        responses,
        aggregatedResponse,
        involvedAgents: responses.map(r => r.agentId),
        processingTime,
        success: responses.some(r => r.success),
        errors: responses.filter(r => !r.success).map(r => r.error || 'Unknown error')
      };

      // Update routing stats
      this.updateRoutingStats(responses);
      
      logger.info(`Coordination ${coordinationId} completed in ${processingTime}ms`);
      
      return coordinationResponse;
    } catch (error) {
      logger.error(`Coordination ${coordinationId} failed:`, error);
      
      const processingTime = Date.now() - startTime;
      
      return {
        responses: [],
        aggregatedResponse: this.createErrorResponse(request.studentMessage, error as Error),
        involvedAgents: [],
        processingTime,
        success: false,
        errors: [(error as Error).message]
      };
    } finally {
      this.activeCoordinations.delete(coordinationId);
    }
  }

  /**
   * Get coordination statistics
   */
  public getCoordinationStats(): {
    activeCoordinations: number;
    routingStats: Record<AgentType, { requests: number; successRate: number }>;
    totalRequests: number;
  } {
    const stats = {
      activeCoordinations: this.activeCoordinations.size,
      routingStats: {} as Record<AgentType, { requests: number; successRate: number }>,
      totalRequests: 0
    };

    for (const [agentType, agentStats] of this.routingStats) {
      const successRate = agentStats.requests > 0 ? agentStats.successes / agentStats.requests : 0;
      stats.routingStats[agentType] = {
        requests: agentStats.requests,
        successRate
      };
      stats.totalRequests += agentStats.requests;
    }

    return stats;
  }

  protected async initialize(): Promise<void> {
    logger.info(`Initializing Coordinator Agent ${this.config.id}`);
    
    // Listen to agent registry events
    this.registry.on('agent:registered', (registration) => {
      logger.info(`New agent registered: ${registration.agentId} (${registration.agentType})`);
    });

    this.registry.on('agent:unregistered', (data) => {
      logger.info(`Agent unregistered: ${data.agentId}`);
      this.handleAgentFailure(data.agentId);
    });
  }

  protected async cleanup(): Promise<void> {
    // Cancel active coordinations
    for (const [coordinationId, request] of this.activeCoordinations) {
      logger.warn(`Cancelling active coordination ${coordinationId}`);
    }
    this.activeCoordinations.clear();
    
    // Remove event listeners
    this.registry.removeAllListeners();
  }

  protected async handleRequest(message: AgentMessage): Promise<AgentMessage | null> {
    try {
      const request = message.payload as CoordinationRequest;
      const response = await this.coordinateRequest(request);
      
      return this.createResponse(message, response);
    } catch (error) {
      logger.error(`Error handling coordination request:`, error);
      throw error;
    }
  }

  protected async handleBroadcast(message: AgentMessage): Promise<void> {
    // Handle system-wide broadcasts
    if (message.payload.type === 'system_status_update') {
      logger.info('Received system status update');
    }
  }

  protected checkHealth(): boolean {
    // Check if coordinator is healthy
    const hasActiveAgents = this.registry.getActiveAgents().length > 0;
    const hasMessageBus = this.messageBus !== null;
    const notOverloaded = this.activeCoordinations.size < this.coordinatorConfig.maxConcurrentTasks;
    
    return hasActiveAgents && hasMessageBus && notOverloaded;
  }

  /**
   * Create routing plan based on request
   */
  private createRoutingPlan(request: CoordinationRequest): RoutingRule[] {
    const applicableRules: RoutingRule[] = [];
    
    for (const rule of this.coordinatorConfig.routingRules) {
      if (this.matchesRoutingCondition(rule.condition, request)) {
        applicableRules.push(rule);
      }
    }

    // Sort by priority (higher priority first)
    applicableRules.sort((a, b) => b.priority - a.priority);
    
    // If no specific rules match, use default routing
    if (applicableRules.length === 0) {
      applicableRules.push(this.getDefaultRoutingRule(request));
    }

    return applicableRules;
  }

  /**
   * Execute routing plan
   */
  private async executeRoutingPlan(
    routingPlan: RoutingRule[],
    request: CoordinationRequest
  ): Promise<AgentResponse[]> {
    const responses: AgentResponse[] = [];
    
    for (const rule of routingPlan) {
      try {
        const agentResponse = await this.routeToAgent(rule, request);
        if (agentResponse) {
          responses.push(agentResponse);
        }
      } catch (error) {
        logger.error(`Failed to route to agent type ${rule.targetAgentType}:`, error);
        
        // Try fallback agents
        if (rule.fallbackTypes) {
          for (const fallbackType of rule.fallbackTypes) {
            try {
              const fallbackRule: RoutingRule = {
                ...rule,
                targetAgentType: fallbackType
              };
              const fallbackResponse = await this.routeToAgent(fallbackRule, request);
              if (fallbackResponse) {
                responses.push(fallbackResponse);
                break;
              }
            } catch (fallbackError) {
              logger.error(`Fallback to ${fallbackType} also failed:`, fallbackError);
            }
          }
        }
      }
    }

    return responses;
  }

  /**
   * Route request to specific agent type
   */
  private async routeToAgent(rule: RoutingRule, request: CoordinationRequest): Promise<AgentResponse | null> {
    const startTime = Date.now();
    
    // Find available agents of the target type
    const availableAgents = this.registry.findAgentsByType(rule.targetAgentType)
      .filter(agent => agent.status === 'active');
    
    if (availableAgents.length === 0) {
      throw new Error(`No available agents of type ${rule.targetAgentType}`);
    }

    // Select agent based on fallback strategy
    const selectedAgent = this.selectAgent(availableAgents);
    
    // Create agent message
    const agentMessage: AgentMessage = {
      id: `route-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      from: this.config.id,
      to: selectedAgent.agentId,
      type: 'request',
      payload: {
        sessionId: request.sessionId,
        message: request.studentMessage,
        context: request.context
      },
      timestamp: new Date()
    };

    try {
      let response: AgentMessage | null;
      
      // Use resilience manager if available
      if (this.resilienceManager) {
        response = await this.resilienceManager.executeAgentMessageWithResilience(
          selectedAgent.agentId,
          rule.targetAgentType,
          agentMessage,
          (msg) => this.messageBus.sendMessage(msg),
          {
            userId: request.context.userId,
            sessionId: request.sessionId
          }
        );
      } else {
        response = await this.messageBus.sendMessage(agentMessage);
      }
      
      const processingTime = Date.now() - startTime;
      
      if (response) {
        return {
          agentId: selectedAgent.agentId,
          agentType: rule.targetAgentType,
          response: response.payload as Message,
          processingTime,
          success: true
        };
      } else {
        throw new Error('No response received from agent');
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      return {
        agentId: selectedAgent.agentId,
        agentType: rule.targetAgentType,
        response: this.createErrorResponse(request.studentMessage, error as Error),
        processingTime,
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Select agent based on strategy
   */
  private selectAgent(agents: any[]): any {
    switch (this.coordinatorConfig.fallbackStrategy) {
      case 'round_robin':
        // Simple round-robin selection
        return agents[Math.floor(Math.random() * agents.length)];
      
      case 'random':
        return agents[Math.floor(Math.random() * agents.length)];
      
      case 'least_busy':
        // For now, just return the first agent
        // In a real implementation, we'd check current load
        return agents[0];
      
      default:
        return agents[0];
    }
  }

  /**
   * Aggregate responses from multiple agents
   */
  private aggregateResponses(responses: AgentResponse[], request: CoordinationRequest): Message {
    if (responses.length === 0) {
      return this.createErrorResponse(request.studentMessage, new Error('No agent responses received'));
    }

    // If only one successful response, return it
    const successfulResponses = responses.filter(r => r.success);
    if (successfulResponses.length === 1) {
      return successfulResponses[0].response;
    }

    // If multiple responses, combine them intelligently
    if (successfulResponses.length > 1) {
      return this.combineResponses(successfulResponses, request);
    }

    // If no successful responses, return error
    return this.createErrorResponse(request.studentMessage, new Error('All agent requests failed'));
  }

  /**
   * Combine multiple agent responses
   */
  private combineResponses(responses: AgentResponse[], request: CoordinationRequest): Message {
    // Simple combination strategy - concatenate responses
    const combinedContent = responses
      .map(r => r.response.content)
      .join('\n\n');

    const metadata: MessageMetadata = {
      messageType: 'explanation',
      agentId: this.config.id,
      hasCode: responses.some(r => r.response.metadata.hasCode),
      hasMath: responses.some(r => r.response.metadata.hasMath)
    };

    return {
      id: `combined-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: 'coordinator',
      content: combinedContent,
      timestamp: new Date(),
      metadata
    };
  }

  /**
   * Create error response
   */
  private createErrorResponse(originalMessage: Message, error: Error): Message {
    const metadata: MessageMetadata = {
      messageType: 'system',
      agentId: this.config.id
    };

    return {
      id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: 'coordinator',
      content: 'I apologize, but I encountered an issue processing your request. Please try again.',
      timestamp: new Date(),
      metadata
    };
  }

  /**
   * Check if request matches routing condition
   */
  private matchesRoutingCondition(condition: RoutingCondition, request: CoordinationRequest): boolean {
    // Check message type
    if (condition.messageType && request.studentMessage.metadata.messageType !== condition.messageType) {
      return false;
    }

    // Check keywords
    if (condition.keywords) {
      const messageContent = request.studentMessage.content.toLowerCase();
      const hasKeyword = condition.keywords.some(keyword => 
        messageContent.includes(keyword.toLowerCase())
      );
      if (!hasKeyword) {
        return false;
      }
    }

    // Check capability requirement
    if (condition.capability) {
      const hasCapability = this.registry.isCapabilityAvailable(condition.capability);
      if (!hasCapability) {
        return false;
      }
    }

    // Check session context
    if (condition.sessionContext) {
      for (const [key, value] of Object.entries(condition.sessionContext)) {
        if (request.context[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get default routing rule
   */
  private getDefaultRoutingRule(request: CoordinationRequest): RoutingRule {
    return {
      condition: {},
      targetAgentType: 'tutor',
      priority: 0,
      fallbackTypes: ['content']
    };
  }

  /**
   * Handle agent failure
   */
  private handleAgentFailure(agentId: string): void {
    // Remove failed agent from any active coordinations
    for (const [coordinationId, request] of this.activeCoordinations) {
      logger.warn(`Agent ${agentId} failed during coordination ${coordinationId}`);
    }
  }

  /**
   * Initialize routing statistics
   */
  private initializeRoutingStats(): void {
    const agentTypes: AgentType[] = ['coordinator', 'tutor', 'assessment', 'content'];
    for (const type of agentTypes) {
      this.routingStats.set(type, { requests: 0, successes: 0, failures: 0 });
    }
  }

  /**
   * Update routing statistics
   */
  private updateRoutingStats(responses: AgentResponse[]): void {
    for (const response of responses) {
      const stats = this.routingStats.get(response.agentType);
      if (stats) {
        stats.requests++;
        if (response.success) {
          stats.successes++;
        } else {
          stats.failures++;
        }
      }
    }
  }
}