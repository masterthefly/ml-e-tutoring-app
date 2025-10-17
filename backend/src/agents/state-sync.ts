import { EventEmitter } from 'events';
import { SharedContextManager, ContextUpdate } from './shared-context.js';
import { MessageBus } from './message-bus.js';
import { AgentMessage } from './base.agent.js';
import { AgentRegistry } from './agent-registry.js';
import { logger } from '../utils/logger.js';

export interface StateSyncConfig {
  syncInterval: number;
  conflictResolution: 'last_write_wins' | 'merge' | 'manual';
  maxRetries: number;
  retryDelay: number;
}

export interface StateConflict {
  sessionId: string;
  agentId: string;
  conflictType: 'concurrent_update' | 'version_mismatch' | 'data_inconsistency';
  localState: any;
  remoteState: any;
  timestamp: Date;
}

export interface SyncOperation {
  id: string;
  sessionId: string;
  agentId: string;
  operation: 'push' | 'pull' | 'merge';
  data: any;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed' | 'conflict';
}

export class StateSynchronizer extends EventEmitter {
  private contextManager: SharedContextManager;
  private messageBus: MessageBus;
  private registry: AgentRegistry;
  private config: StateSyncConfig;
  private syncOperations: Map<string, SyncOperation> = new Map();
  private conflicts: Map<string, StateConflict> = new Map();
  private syncInterval: NodeJS.Timeout | null = null;
  private agentVersions: Map<string, Map<string, number>> = new Map(); // sessionId -> agentId -> version

  constructor(
    config: StateSyncConfig,
    contextManager: SharedContextManager,
    messageBus: MessageBus,
    registry: AgentRegistry
  ) {
    super();
    this.config = config;
    this.contextManager = contextManager;
    this.messageBus = messageBus;
    this.registry = registry;

    this.setupEventListeners();
    this.startSyncProcess();
  }

  /**
   * Synchronize agent state with shared context
   */
  public async syncAgentState(
    sessionId: string,
    agentId: string,
    localState: any,
    operation: 'push' | 'pull' = 'push'
  ): Promise<boolean> {
    const syncId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const syncOperation: SyncOperation = {
      id: syncId,
      sessionId,
      agentId,
      operation,
      data: localState,
      timestamp: new Date(),
      status: 'pending'
    };

    this.syncOperations.set(syncId, syncOperation);

    try {
      let success = false;

      switch (operation) {
        case 'push':
          success = await this.pushState(syncOperation);
          break;
        case 'pull':
          success = await this.pullState(syncOperation);
          break;
        default:
          throw new Error(`Unknown sync operation: ${operation}`);
      }

      syncOperation.status = success ? 'completed' : 'failed';
      
      if (success) {
        this.updateAgentVersion(sessionId, agentId);
        this.emit('sync:completed', syncOperation);
      } else {
        this.emit('sync:failed', syncOperation);
      }

      return success;
    } catch (error) {
      logger.error(`Sync operation ${syncId} failed:`, error);
      syncOperation.status = 'failed';
      this.emit('sync:failed', { ...syncOperation, error });
      return false;
    } finally {
      // Clean up completed operations after a delay
      setTimeout(() => {
        this.syncOperations.delete(syncId);
      }, 60000); // 1 minute
    }
  }

  /**
   * Broadcast state change to all agents in session
   */
  public async broadcastStateChange(
    sessionId: string,
    sourceAgentId: string,
    changeType: string,
    data: any
  ): Promise<void> {
    const broadcastMessage: Omit<AgentMessage, 'to'> = {
      id: `broadcast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from: sourceAgentId,
      type: 'broadcast',
      payload: {
        type: 'state_change',
        sessionId,
        changeType,
        data,
        version: this.getAgentVersion(sessionId, sourceAgentId)
      },
      timestamp: new Date()
    };

    await this.messageBus.broadcastMessage(broadcastMessage);
    
    logger.debug(`Broadcasted state change from ${sourceAgentId} in session ${sessionId}`);
    this.emit('state:broadcasted', { sessionId, sourceAgentId, changeType });
  }

  /**
   * Handle incoming state change notification
   */
  public async handleStateChangeNotification(
    sessionId: string,
    sourceAgentId: string,
    targetAgentId: string,
    changeData: any
  ): Promise<void> {
    try {
      // Check for version conflicts
      const sourceVersion = changeData.version || 0;
      const localVersion = this.getAgentVersion(sessionId, targetAgentId);
      
      if (sourceVersion < localVersion) {
        // Source is behind, ignore the change
        logger.debug(`Ignoring outdated state change from ${sourceAgentId}`);
        return;
      }

      if (sourceVersion === localVersion) {
        // Potential conflict
        await this.handleVersionConflict(sessionId, sourceAgentId, targetAgentId, changeData);
        return;
      }

      // Apply the state change
      await this.applyStateChange(sessionId, targetAgentId, changeData);
      
      this.emit('state:applied', { sessionId, sourceAgentId, targetAgentId });
    } catch (error) {
      logger.error(`Failed to handle state change notification:`, error);
      this.emit('state:error', { sessionId, sourceAgentId, targetAgentId, error });
    }
  }

  /**
   * Resolve state conflict
   */
  public async resolveConflict(
    conflictId: string,
    resolution: 'accept_local' | 'accept_remote' | 'merge'
  ): Promise<boolean> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      return false;
    }

    try {
      let resolvedState: any;

      switch (resolution) {
        case 'accept_local':
          resolvedState = conflict.localState;
          break;
        case 'accept_remote':
          resolvedState = conflict.remoteState;
          break;
        case 'merge':
          resolvedState = this.mergeStates(conflict.localState, conflict.remoteState);
          break;
      }

      // Apply resolved state
      const update: ContextUpdate = {
        sessionId: conflict.sessionId,
        agentId: conflict.agentId,
        updateType: 'agent_state',
        data: resolvedState,
        timestamp: new Date()
      };

      await this.contextManager.updateContext(update);
      
      // Remove conflict
      this.conflicts.delete(conflictId);
      
      logger.info(`Resolved conflict ${conflictId} with strategy: ${resolution}`);
      this.emit('conflict:resolved', { conflictId, resolution, resolvedState });
      
      return true;
    } catch (error) {
      logger.error(`Failed to resolve conflict ${conflictId}:`, error);
      return false;
    }
  }

  /**
   * Get pending conflicts
   */
  public getPendingConflicts(): StateConflict[] {
    return Array.from(this.conflicts.values());
  }

  /**
   * Get sync statistics
   */
  public getSyncStatistics(): {
    pendingOperations: number;
    completedOperations: number;
    failedOperations: number;
    activeConflicts: number;
    syncRate: number;
  } {
    const operations = Array.from(this.syncOperations.values());
    
    return {
      pendingOperations: operations.filter(op => op.status === 'pending').length,
      completedOperations: operations.filter(op => op.status === 'completed').length,
      failedOperations: operations.filter(op => op.status === 'failed').length,
      activeConflicts: this.conflicts.size,
      syncRate: this.calculateSyncRate()
    };
  }

  /**
   * Push local state to shared context
   */
  private async pushState(operation: SyncOperation): Promise<boolean> {
    const update: ContextUpdate = {
      sessionId: operation.sessionId,
      agentId: operation.agentId,
      updateType: 'agent_state',
      data: operation.data,
      timestamp: operation.timestamp
    };

    await this.contextManager.updateContext(update);
    
    // Broadcast change to other agents
    await this.broadcastStateChange(
      operation.sessionId,
      operation.agentId,
      'state_update',
      operation.data
    );

    return true;
  }

  /**
   * Pull state from shared context
   */
  private async pullState(operation: SyncOperation): Promise<boolean> {
    const contextData = await this.contextManager.getContext(operation.sessionId);
    if (!contextData) {
      return false;
    }

    const agentState = contextData.agentStates.get(operation.agentId);
    if (agentState) {
      operation.data = agentState;
      return true;
    }

    return false;
  }

  /**
   * Merge local and remote state
   */
  private async mergeState(operation: SyncOperation): Promise<boolean> {
    const contextData = await this.contextManager.getContext(operation.sessionId);
    if (!contextData) {
      return false;
    }

    const remoteState = contextData.agentStates.get(operation.agentId);
    if (!remoteState) {
      // No remote state, just push local
      return this.pushState(operation);
    }

    const mergedState = this.mergeStates(operation.data, remoteState);
    
    const update: ContextUpdate = {
      sessionId: operation.sessionId,
      agentId: operation.agentId,
      updateType: 'agent_state',
      data: mergedState,
      timestamp: operation.timestamp
    };

    await this.contextManager.updateContext(update);
    return true;
  }

  /**
   * Apply state change to local context
   */
  private async applyStateChange(
    sessionId: string,
    agentId: string,
    changeData: any
  ): Promise<void> {
    const update: ContextUpdate = {
      sessionId,
      agentId,
      updateType: 'agent_state',
      data: changeData.data,
      timestamp: new Date()
    };

    await this.contextManager.updateContext(update);
    this.updateAgentVersion(sessionId, agentId);
  }

  /**
   * Handle version conflict
   */
  private async handleVersionConflict(
    sessionId: string,
    sourceAgentId: string,
    targetAgentId: string,
    changeData: any
  ): Promise<void> {
    const conflictId = `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const contextData = await this.contextManager.getContext(sessionId);
    const localState = contextData?.agentStates.get(targetAgentId);
    
    const conflict: StateConflict = {
      sessionId,
      agentId: targetAgentId,
      conflictType: 'concurrent_update',
      localState,
      remoteState: changeData.data,
      timestamp: new Date()
    };

    this.conflicts.set(conflictId, conflict);
    
    // Auto-resolve based on configuration
    if (this.config.conflictResolution !== 'manual') {
      await this.autoResolveConflict(conflictId);
    }

    this.emit('conflict:detected', { conflictId, conflict });
  }

  /**
   * Auto-resolve conflict based on configuration
   */
  private async autoResolveConflict(conflictId: string): Promise<void> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      return;
    }

    let resolution: 'accept_local' | 'accept_remote' | 'merge';

    switch (this.config.conflictResolution) {
      case 'last_write_wins':
        resolution = 'accept_remote';
        break;
      case 'merge':
        resolution = 'merge';
        break;
      default:
        return; // Manual resolution required
    }

    await this.resolveConflict(conflictId, resolution);
  }

  /**
   * Merge two states
   */
  private mergeStates(localState: any, remoteState: any): any {
    // Simple merge strategy - remote takes precedence for conflicts
    return {
      ...localState,
      ...remoteState,
      context: {
        ...localState?.context,
        ...remoteState?.context
      },
      lastUpdated: new Date()
    };
  }

  /**
   * Get agent version for session
   */
  private getAgentVersion(sessionId: string, agentId: string): number {
    const sessionVersions = this.agentVersions.get(sessionId);
    return sessionVersions?.get(agentId) || 0;
  }

  /**
   * Update agent version
   */
  private updateAgentVersion(sessionId: string, agentId: string): void {
    if (!this.agentVersions.has(sessionId)) {
      this.agentVersions.set(sessionId, new Map());
    }
    
    const sessionVersions = this.agentVersions.get(sessionId)!;
    const currentVersion = sessionVersions.get(agentId) || 0;
    sessionVersions.set(agentId, currentVersion + 1);
  }

  /**
   * Calculate sync rate
   */
  private calculateSyncRate(): number {
    // Simple implementation - return operations per minute
    const operations = Array.from(this.syncOperations.values());
    const recentOperations = operations.filter(
      op => Date.now() - op.timestamp.getTime() < 60000 // Last minute
    );
    
    return recentOperations.length;
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.contextManager.on('context:updated', (update: ContextUpdate) => {
      if (update.updateType === 'agent_state') {
        this.broadcastStateChange(
          update.sessionId,
          update.agentId,
          'context_updated',
          update.data
        );
      }
    });

    this.registry.on('agent:unregistered', (data) => {
      // Clean up versions for unregistered agent
      for (const sessionVersions of this.agentVersions.values()) {
        sessionVersions.delete(data.agentId);
      }
    });
  }

  /**
   * Start sync process
   */
  private startSyncProcess(): void {
    this.syncInterval = setInterval(() => {
      this.performPeriodicSync();
    }, this.config.syncInterval);
  }

  /**
   * Perform periodic sync
   */
  private async performPeriodicSync(): Promise<void> {
    try {
      // Clean up old operations
      const cutoffTime = Date.now() - 300000; // 5 minutes
      for (const [id, operation] of this.syncOperations) {
        if (operation.timestamp.getTime() < cutoffTime) {
          this.syncOperations.delete(id);
        }
      }

      // Clean up old conflicts
      for (const [id, conflict] of this.conflicts) {
        if (conflict.timestamp.getTime() < cutoffTime) {
          this.conflicts.delete(id);
        }
      }

      this.emit('sync:periodic_cleanup');
    } catch (error) {
      logger.error('Error during periodic sync:', error);
    }
  }

  /**
   * Stop sync process
   */
  public stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stop();
    this.syncOperations.clear();
    this.conflicts.clear();
    this.agentVersions.clear();
    this.removeAllListeners();
  }
}