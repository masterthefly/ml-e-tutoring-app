import { EventEmitter } from 'events';
import { BaseAgent, AgentCapability } from './base.agent.js';
import { AgentType, AgentState } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface AgentRegistration {
  agentId: string;
  agentType: AgentType;
  capabilities: AgentCapability[];
  status: AgentState['status'];
  registeredAt: Date;
  lastSeen: Date;
  metadata: Record<string, any>;
}

export interface AgentDiscoveryQuery {
  agentType?: AgentType;
  capability?: string;
  status?: AgentState['status'];
  metadata?: Record<string, any>;
}

export class AgentRegistry extends EventEmitter {
  private registrations: Map<string, AgentRegistration> = new Map();
  private capabilityIndex: Map<string, Set<string>> = new Map();
  private typeIndex: Map<AgentType, Set<string>> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly AGENT_TIMEOUT = 60000; // 1 minute

  constructor() {
    super();
    this.startHealthMonitoring();
  }

  /**
   * Register an agent in the registry
   */
  public registerAgent(agent: BaseAgent, metadata: Record<string, any> = {}): void {
    const state = agent.getState();
    const capabilities = agent.getCapabilities();
    
    const registration: AgentRegistration = {
      agentId: state.agentId,
      agentType: state.agentType,
      capabilities,
      status: state.status,
      registeredAt: new Date(),
      lastSeen: new Date(),
      metadata
    };

    // Store registration
    this.registrations.set(state.agentId, registration);

    // Update capability index
    for (const capability of capabilities) {
      if (!this.capabilityIndex.has(capability.name)) {
        this.capabilityIndex.set(capability.name, new Set());
      }
      this.capabilityIndex.get(capability.name)!.add(state.agentId);
    }

    // Update type index
    if (!this.typeIndex.has(state.agentType)) {
      this.typeIndex.set(state.agentType, new Set());
    }
    this.typeIndex.get(state.agentType)!.add(state.agentId);

    logger.info(`Agent ${state.agentId} registered in registry`);
    this.emit('agent:registered', registration);
  }

  /**
   * Unregister an agent from the registry
   */
  public unregisterAgent(agentId: string): void {
    const registration = this.registrations.get(agentId);
    if (!registration) {
      return;
    }

    // Remove from capability index
    for (const capability of registration.capabilities) {
      const capabilitySet = this.capabilityIndex.get(capability.name);
      if (capabilitySet) {
        capabilitySet.delete(agentId);
        if (capabilitySet.size === 0) {
          this.capabilityIndex.delete(capability.name);
        }
      }
    }

    // Remove from type index
    const typeSet = this.typeIndex.get(registration.agentType);
    if (typeSet) {
      typeSet.delete(agentId);
      if (typeSet.size === 0) {
        this.typeIndex.delete(registration.agentType);
      }
    }

    // Remove registration
    this.registrations.delete(agentId);

    logger.info(`Agent ${agentId} unregistered from registry`);
    this.emit('agent:unregistered', { agentId, registration });
  }

  /**
   * Update agent status in registry
   */
  public updateAgentStatus(agentId: string, status: AgentState['status']): void {
    const registration = this.registrations.get(agentId);
    if (registration) {
      registration.status = status;
      registration.lastSeen = new Date();
      this.emit('agent:status_updated', { agentId, status });
    }
  }

  /**
   * Update agent last seen timestamp
   */
  public updateAgentLastSeen(agentId: string): void {
    const registration = this.registrations.get(agentId);
    if (registration) {
      registration.lastSeen = new Date();
    }
  }

  /**
   * Discover agents based on query criteria
   */
  public discoverAgents(query: AgentDiscoveryQuery): AgentRegistration[] {
    const results: AgentRegistration[] = [];

    for (const registration of this.registrations.values()) {
      if (this.matchesQuery(registration, query)) {
        results.push({ ...registration });
      }
    }

    // Sort by registration time (newest first)
    results.sort((a, b) => b.registeredAt.getTime() - a.registeredAt.getTime());

    return results;
  }

  /**
   * Find agents by capability
   */
  public findAgentsByCapability(capability: string): AgentRegistration[] {
    const agentIds = this.capabilityIndex.get(capability);
    if (!agentIds) {
      return [];
    }

    const results: AgentRegistration[] = [];
    for (const agentId of agentIds) {
      const registration = this.registrations.get(agentId);
      if (registration && registration.status === 'active') {
        results.push({ ...registration });
      }
    }

    return results;
  }

  /**
   * Find agents by type
   */
  public findAgentsByType(agentType: AgentType): AgentRegistration[] {
    const agentIds = this.typeIndex.get(agentType);
    if (!agentIds) {
      return [];
    }

    const results: AgentRegistration[] = [];
    for (const agentId of agentIds) {
      const registration = this.registrations.get(agentId);
      if (registration) {
        results.push({ ...registration });
      }
    }

    return results;
  }

  /**
   * Get agent registration by ID
   */
  public getAgent(agentId: string): AgentRegistration | undefined {
    const registration = this.registrations.get(agentId);
    return registration ? { ...registration } : undefined;
  }

  /**
   * Get all registered agents
   */
  public getAllAgents(): AgentRegistration[] {
    return Array.from(this.registrations.values()).map(reg => ({ ...reg }));
  }

  /**
   * Get active agents
   */
  public getActiveAgents(): AgentRegistration[] {
    return this.getAllAgents().filter(reg => reg.status === 'active');
  }

  /**
   * Get available capabilities
   */
  public getAvailableCapabilities(): string[] {
    return Array.from(this.capabilityIndex.keys());
  }

  /**
   * Get registered agent types
   */
  public getRegisteredTypes(): AgentType[] {
    return Array.from(this.typeIndex.keys());
  }

  /**
   * Check if capability is available
   */
  public isCapabilityAvailable(capability: string): boolean {
    const agentIds = this.capabilityIndex.get(capability);
    if (!agentIds) {
      return false;
    }

    for (const agentId of agentIds) {
      const registration = this.registrations.get(agentId);
      if (registration && registration.status === 'active') {
        return true;
      }
    }

    return false;
  }

  /**
   * Get registry statistics
   */
  public getStatistics(): {
    totalAgents: number;
    activeAgents: number;
    agentsByType: Record<AgentType, number>;
    availableCapabilities: number;
  } {
    const stats = {
      totalAgents: this.registrations.size,
      activeAgents: 0,
      agentsByType: {} as Record<AgentType, number>,
      availableCapabilities: this.capabilityIndex.size
    };

    for (const registration of this.registrations.values()) {
      if (registration.status === 'active') {
        stats.activeAgents++;
      }

      if (!stats.agentsByType[registration.agentType]) {
        stats.agentsByType[registration.agentType] = 0;
      }
      stats.agentsByType[registration.agentType]++;
    }

    return stats;
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop health monitoring
   */
  public stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Perform health check on all registered agents
   */
  private performHealthCheck(): void {
    const now = new Date();
    const expiredAgents: string[] = [];

    for (const [agentId, registration] of this.registrations) {
      const timeSinceLastSeen = now.getTime() - registration.lastSeen.getTime();
      
      if (timeSinceLastSeen > this.AGENT_TIMEOUT) {
        expiredAgents.push(agentId);
      }
    }

    // Remove expired agents
    for (const agentId of expiredAgents) {
      logger.warn(`Agent ${agentId} timed out, removing from registry`);
      this.unregisterAgent(agentId);
      this.emit('agent:timeout', { agentId });
    }
  }

  /**
   * Check if registration matches query
   */
  private matchesQuery(registration: AgentRegistration, query: AgentDiscoveryQuery): boolean {
    if (query.agentType && registration.agentType !== query.agentType) {
      return false;
    }

    if (query.status && registration.status !== query.status) {
      return false;
    }

    if (query.capability) {
      const hasCapability = registration.capabilities.some(cap => cap.name === query.capability);
      if (!hasCapability) {
        return false;
      }
    }

    if (query.metadata) {
      for (const [key, value] of Object.entries(query.metadata)) {
        if (registration.metadata[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Cleanup registry
   */
  public cleanup(): void {
    this.stopHealthMonitoring();
    this.registrations.clear();
    this.capabilityIndex.clear();
    this.typeIndex.clear();
    this.removeAllListeners();
  }
}