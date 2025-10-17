import { EventEmitter } from 'events';
import { Message, MessageMetadata } from '../types/index.js';
import { CircuitBreakerError } from './circuit-breaker.service.js';
import { RetryError } from './retry.service.js';
import { logger } from '../utils/logger.js';

export interface ErrorHandlerConfig {
  enableUserFriendlyMessages: boolean;
  enableErrorRecovery: boolean;
  enableProgressPreservation: boolean;
  maxErrorHistory: number;
  errorReportingEnabled: boolean;
}

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  agentId?: string;
  agentType?: string;
  operation?: string;
  timestamp: Date;
  userMessage?: string;
}

export interface UserFriendlyError {
  message: string;
  suggestion: string;
  canRetry: boolean;
  severity: 'low' | 'medium' | 'high';
  errorCode: string;
  recoveryActions?: string[];
}

export interface ErrorReport {
  id: string;
  error: Error;
  context: ErrorContext;
  userFriendlyError: UserFriendlyError;
  timestamp: Date;
  resolved: boolean;
  resolutionTime?: Date;
}

export class ErrorHandlerService extends EventEmitter {
  private config: ErrorHandlerConfig;
  private errorHistory: Map<string, ErrorReport[]> = new Map();
  private progressBackups: Map<string, any> = new Map();

  constructor(config: ErrorHandlerConfig) {
    super();
    this.config = config;
  }

  /**
   * Handle error and return user-friendly response
   */
  public async handleError(
    error: Error,
    context: ErrorContext
  ): Promise<Message> {
    const errorReport = this.createErrorReport(error, context);
    
    // Store error in history
    this.storeErrorReport(errorReport);
    
    // Preserve progress if enabled
    if (this.config.enableProgressPreservation && context.sessionId) {
      await this.preserveProgress(context.sessionId, context);
    }
    
    // Generate user-friendly response
    const userFriendlyError = this.generateUserFriendlyError(error, context);
    const responseMessage = this.createErrorResponseMessage(userFriendlyError, context);
    
    // Emit error event for monitoring
    this.emit('error:handled', {
      errorReport,
      userFriendlyError,
      context
    });
    
    // Log error for debugging
    logger.error(`Error handled for ${context.operation || 'unknown operation'}:`, {
      error: error.message,
      context,
      userFriendlyMessage: userFriendlyError.message
    });
    
    return responseMessage;
  }

  /**
   * Handle circuit breaker errors specifically
   */
  public async handleCircuitBreakerError(
    error: CircuitBreakerError,
    context: ErrorContext
  ): Promise<Message> {
    const enhancedContext = {
      ...context,
      operation: 'circuit_breaker_protection'
    };

    const userFriendlyError: UserFriendlyError = {
      message: "I'm temporarily experiencing high load and need a moment to recover.",
      suggestion: "Please wait a few seconds and try your question again.",
      canRetry: true,
      severity: 'medium',
      errorCode: 'CIRCUIT_BREAKER_OPEN',
      recoveryActions: [
        'Wait 30 seconds before retrying',
        'Try asking a simpler question',
        'Check system status'
      ]
    };

    return this.createErrorResponseMessage(userFriendlyError, enhancedContext);
  }

  /**
   * Handle retry errors specifically
   */
  public async handleRetryError(
    error: RetryError,
    context: ErrorContext
  ): Promise<Message> {
    const enhancedContext = {
      ...context,
      operation: 'retry_exhausted'
    };

    const userFriendlyError: UserFriendlyError = {
      message: "I tried several times but couldn't process your request right now.",
      suggestion: "The system might be experiencing temporary issues. Please try again in a few minutes.",
      canRetry: true,
      severity: 'high',
      errorCode: 'RETRY_EXHAUSTED',
      recoveryActions: [
        'Wait 2-3 minutes before retrying',
        'Check if the system is under maintenance',
        'Try a different approach to your question'
      ]
    };

    return this.createErrorResponseMessage(userFriendlyError, enhancedContext);
  }

  /**
   * Get error statistics for monitoring
   */
  public getErrorStatistics(): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsBySeverity: Record<string, number>;
    recentErrors: number;
    averageResolutionTime: number;
  } {
    const allErrors = Array.from(this.errorHistory.values()).flat();
    const recentCutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    const stats = {
      totalErrors: allErrors.length,
      errorsByType: {} as Record<string, number>,
      errorsBySeverity: {} as Record<string, number>,
      recentErrors: 0,
      averageResolutionTime: 0
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const errorReport of allErrors) {
      // Count by error code
      const errorCode = errorReport.userFriendlyError.errorCode;
      stats.errorsByType[errorCode] = (stats.errorsByType[errorCode] || 0) + 1;
      
      // Count by severity
      const severity = errorReport.userFriendlyError.severity;
      stats.errorsBySeverity[severity] = (stats.errorsBySeverity[severity] || 0) + 1;
      
      // Count recent errors
      if (errorReport.timestamp.getTime() > recentCutoff) {
        stats.recentErrors++;
      }
      
      // Calculate resolution time
      if (errorReport.resolved && errorReport.resolutionTime) {
        totalResolutionTime += errorReport.resolutionTime.getTime() - errorReport.timestamp.getTime();
        resolvedCount++;
      }
    }

    if (resolvedCount > 0) {
      stats.averageResolutionTime = totalResolutionTime / resolvedCount;
    }

    return stats;
  }

  /**
   * Mark error as resolved
   */
  public markErrorResolved(errorId: string): boolean {
    for (const userErrors of this.errorHistory.values()) {
      const errorReport = userErrors.find(e => e.id === errorId);
      if (errorReport && !errorReport.resolved) {
        errorReport.resolved = true;
        errorReport.resolutionTime = new Date();
        
        this.emit('error:resolved', { errorReport });
        return true;
      }
    }
    return false;
  }

  /**
   * Get user error history
   */
  public getUserErrorHistory(userId: string): ErrorReport[] {
    return this.errorHistory.get(userId) || [];
  }

  /**
   * Clear error history for user
   */
  public clearUserErrorHistory(userId: string): void {
    this.errorHistory.delete(userId);
  }

  /**
   * Restore progress from backup
   */
  public async restoreProgress(sessionId: string): Promise<any | null> {
    return this.progressBackups.get(sessionId) || null;
  }

  /**
   * Create error report
   */
  private createErrorReport(error: Error, context: ErrorContext): ErrorReport {
    const userFriendlyError = this.generateUserFriendlyError(error, context);
    
    return {
      id: `error-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      error,
      context,
      userFriendlyError,
      timestamp: new Date(),
      resolved: false
    };
  }

  /**
   * Generate user-friendly error message
   */
  private generateUserFriendlyError(error: Error, context: ErrorContext): UserFriendlyError {
    // Handle specific error types
    if (error instanceof CircuitBreakerError) {
      return {
        message: "I'm temporarily experiencing high load and need a moment to recover.",
        suggestion: "Please wait a few seconds and try again.",
        canRetry: true,
        severity: 'medium',
        errorCode: 'CIRCUIT_BREAKER_OPEN',
        recoveryActions: ['Wait 30 seconds', 'Try a simpler question']
      };
    }

    if (error instanceof RetryError) {
      return {
        message: "I tried several times but couldn't complete your request.",
        suggestion: "Please try again in a few minutes.",
        canRetry: true,
        severity: 'high',
        errorCode: 'RETRY_EXHAUSTED',
        recoveryActions: ['Wait 2-3 minutes', 'Try a different approach']
      };
    }

    // Handle common error patterns
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      return {
        message: "Your request took longer than expected to process.",
        suggestion: "Please try again. If this continues, the system might be busy.",
        canRetry: true,
        severity: 'medium',
        errorCode: 'TIMEOUT_ERROR',
        recoveryActions: ['Try again immediately', 'Wait a moment if it persists']
      };
    }

    if (error.message.includes('connection') || error.message.includes('ECONNREFUSED')) {
      return {
        message: "I'm having trouble connecting to some services right now.",
        suggestion: "This is usually temporary. Please try again in a moment.",
        canRetry: true,
        severity: 'high',
        errorCode: 'CONNECTION_ERROR',
        recoveryActions: ['Wait 1-2 minutes', 'Check system status']
      };
    }

    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return {
        message: "There seems to be an issue with your request format.",
        suggestion: "Please try rephrasing your question or check your input.",
        canRetry: true,
        severity: 'low',
        errorCode: 'VALIDATION_ERROR',
        recoveryActions: ['Rephrase your question', 'Check for typos']
      };
    }

    if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
      return {
        message: "There's an issue with your session.",
        suggestion: "Please try refreshing the page or logging in again.",
        canRetry: false,
        severity: 'medium',
        errorCode: 'AUTH_ERROR',
        recoveryActions: ['Refresh the page', 'Log out and log back in']
      };
    }

    // Default error handling
    return {
      message: "I encountered an unexpected issue while processing your request.",
      suggestion: "Please try again. If the problem continues, it will be reported for investigation.",
      canRetry: true,
      severity: 'medium',
      errorCode: 'UNKNOWN_ERROR',
      recoveryActions: ['Try again', 'Wait a few minutes if it persists']
    };
  }

  /**
   * Create error response message
   */
  private createErrorResponseMessage(
    userFriendlyError: UserFriendlyError,
    context: ErrorContext
  ): Message {
    let content = userFriendlyError.message;
    
    if (userFriendlyError.suggestion) {
      content += ` ${userFriendlyError.suggestion}`;
    }

    if (userFriendlyError.canRetry) {
      content += " You can try asking your question again.";
    }

    // Add recovery actions if available
    if (userFriendlyError.recoveryActions && userFriendlyError.recoveryActions.length > 0) {
      content += "\n\nHere's what you can try:\n";
      content += userFriendlyError.recoveryActions.map(action => `• ${action}`).join('\n');
    }

    const metadata: MessageMetadata = {
      messageType: 'error',
      agentId: context.agentId || 'error-handler',
      errorCode: userFriendlyError.errorCode,
      severity: userFriendlyError.severity,
      canRetry: userFriendlyError.canRetry
    };

    return {
      id: `error-msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      sender: 'system',
      content,
      timestamp: new Date(),
      metadata
    };
  }

  /**
   * Store error report in history
   */
  private storeErrorReport(errorReport: ErrorReport): void {
    const userId = errorReport.context.userId;
    if (!userId) {
      return;
    }

    if (!this.errorHistory.has(userId)) {
      this.errorHistory.set(userId, []);
    }

    const userErrors = this.errorHistory.get(userId)!;
    userErrors.push(errorReport);

    // Limit history size
    if (userErrors.length > this.config.maxErrorHistory) {
      userErrors.splice(0, userErrors.length - this.config.maxErrorHistory);
    }
  }

  /**
   * Preserve progress for recovery
   */
  private async preserveProgress(sessionId: string, context: ErrorContext): Promise<void> {
    try {
      // This would typically save current session state, progress, etc.
      // For now, we'll store basic context information
      const progressData = {
        sessionId,
        timestamp: new Date(),
        context: {
          userId: context.userId,
          agentId: context.agentId,
          agentType: context.agentType,
          operation: context.operation
        },
        // In a real implementation, this would include:
        // - Current learning progress
        // - Conversation history
        // - User preferences
        // - Session state
      };

      this.progressBackups.set(sessionId, progressData);
      
      // Clean up old backups (keep only recent ones)
      this.cleanupProgressBackups();
      
      logger.debug(`Progress preserved for session ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to preserve progress for session ${sessionId}:`, error);
    }
  }

  /**
   * Clean up old progress backups
   */
  private cleanupProgressBackups(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    const expiredSessions: string[] = [];

    for (const [sessionId, backup] of this.progressBackups) {
      if (backup.timestamp.getTime() < cutoffTime) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this.progressBackups.delete(sessionId);
    }

    if (expiredSessions.length > 0) {
      logger.debug(`Cleaned up ${expiredSessions.length} expired progress backups`);
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.errorHistory.clear();
    this.progressBackups.clear();
    this.removeAllListeners();
  }
}