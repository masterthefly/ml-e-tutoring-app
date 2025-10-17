import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  halfOpenMaxCalls: number;
  slowCallThreshold: number;
  slowCallRateThreshold: number;
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  slowCalls: number;
  averageResponseTime: number;
  failureRate: number;
  slowCallRate: number;
  state: CircuitState;
  lastStateChange: Date;
  nextRetryTime?: Date;
}

export class CircuitBreakerError extends Error {
  constructor(message: string, public readonly state: CircuitState) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private slowCallCount: number = 0;
  private totalCalls: number = 0;
  private lastFailureTime: Date | null = null;
  private lastStateChange: Date = new Date();
  private halfOpenCalls: number = 0;
  private responseTimes: number[] = [];
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {
    super();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        const nextRetry = this.getNextRetryTime();
        throw new CircuitBreakerError(
          `Circuit breaker is OPEN for ${this.name}. Next retry at ${nextRetry?.toISOString()}`,
          CircuitState.OPEN
        );
      }
    }

    if (this.state === CircuitState.HALF_OPEN && this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      throw new CircuitBreakerError(
        `Circuit breaker is HALF_OPEN and at maximum test calls for ${this.name}`,
        CircuitState.HALF_OPEN
      );
    }

    return this.executeCall(fn);
  }

  /**
   * Get current circuit breaker metrics
   */
  public getMetrics(): CircuitBreakerMetrics {
    const averageResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
      : 0;

    const failureRate = this.totalCalls > 0 ? this.failureCount / this.totalCalls : 0;
    const slowCallRate = this.totalCalls > 0 ? this.slowCallCount / this.totalCalls : 0;

    return {
      totalCalls: this.totalCalls,
      successfulCalls: this.successCount,
      failedCalls: this.failureCount,
      slowCalls: this.slowCallCount,
      averageResponseTime,
      failureRate,
      slowCallRate,
      state: this.state,
      lastStateChange: this.lastStateChange,
      nextRetryTime: this.getNextRetryTime()
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  public reset(): void {
    this.transitionToClosed();
    this.resetMetrics();
    logger.info(`Circuit breaker ${this.name} manually reset`);
  }

  /**
   * Force circuit breaker to open state
   */
  public forceOpen(): void {
    this.transitionToOpen();
    logger.warn(`Circuit breaker ${this.name} manually opened`);
  }

  /**
   * Get circuit breaker name
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Get current state
   */
  public getState(): CircuitState {
    return this.state;
  }

  /**
   * Execute the actual function call
   */
  private async executeCall<T>(fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    this.totalCalls++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      const responseTime = Date.now() - startTime;
      
      this.recordSuccess(responseTime);
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordFailure(responseTime);
      throw error;
    }
  }

  /**
   * Record successful call
   */
  private recordSuccess(responseTime: number): void {
    this.successCount++;
    this.recordResponseTime(responseTime);

    // Check if call was slow
    if (responseTime > this.config.slowCallThreshold) {
      this.slowCallCount++;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // If we're in half-open and got a success, consider closing
      if (this.shouldClose()) {
        this.transitionToClosed();
      }
    }

    this.emit('call:success', {
      circuitBreaker: this.name,
      responseTime,
      state: this.state
    });
  }

  /**
   * Record failed call
   */
  private recordFailure(responseTime: number): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    this.recordResponseTime(responseTime);

    // Check if call was slow
    if (responseTime > this.config.slowCallThreshold) {
      this.slowCallCount++;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // If we're in half-open and got a failure, go back to open
      this.transitionToOpen();
    } else if (this.state === CircuitState.CLOSED && this.shouldOpen()) {
      this.transitionToOpen();
    }

    this.emit('call:failure', {
      circuitBreaker: this.name,
      responseTime,
      state: this.state,
      failureCount: this.failureCount
    });
  }

  /**
   * Record response time
   */
  private recordResponseTime(responseTime: number): void {
    this.responseTimes.push(responseTime);
    
    // Keep only recent response times for monitoring period
    const cutoffTime = Date.now() - this.config.monitoringPeriod;
    this.responseTimes = this.responseTimes.filter((_, index) => {
      const recordTime = Date.now() - (this.responseTimes.length - index - 1) * 100; // Approximate
      return recordTime > cutoffTime;
    });
  }

  /**
   * Check if circuit should open
   */
  private shouldOpen(): boolean {
    if (this.totalCalls < this.config.failureThreshold) {
      return false;
    }

    const failureRate = this.failureCount / this.totalCalls;
    const slowCallRate = this.slowCallCount / this.totalCalls;

    return failureRate >= 0.5 || // 50% failure rate
           slowCallRate >= this.config.slowCallRateThreshold;
  }

  /**
   * Check if circuit should close (from half-open)
   */
  private shouldClose(): boolean {
    // Close if we have enough successful calls in half-open state
    return this.halfOpenCalls >= this.config.halfOpenMaxCalls;
  }

  /**
   * Check if we should attempt reset (transition to half-open)
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) {
      return true;
    }

    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceLastFailure >= this.config.resetTimeout;
  }

  /**
   * Get next retry time
   */
  private getNextRetryTime(): Date | undefined {
    if (this.state !== CircuitState.OPEN || !this.lastFailureTime) {
      return undefined;
    }

    return new Date(this.lastFailureTime.getTime() + this.config.resetTimeout);
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.lastStateChange = new Date();
    this.halfOpenCalls = 0;
    
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    if (previousState !== CircuitState.CLOSED) {
      logger.info(`Circuit breaker ${this.name} transitioned to CLOSED`);
      this.emit('state:changed', {
        circuitBreaker: this.name,
        previousState,
        currentState: this.state,
        timestamp: this.lastStateChange
      });
    }
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.OPEN;
    this.lastStateChange = new Date();
    this.halfOpenCalls = 0;

    // Set timer to automatically transition to half-open
    this.resetTimer = setTimeout(() => {
      this.transitionToHalfOpen();
    }, this.config.resetTimeout);

    if (previousState !== CircuitState.OPEN) {
      logger.warn(`Circuit breaker ${this.name} transitioned to OPEN`);
      this.emit('state:changed', {
        circuitBreaker: this.name,
        previousState,
        currentState: this.state,
        timestamp: this.lastStateChange
      });
    }
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.lastStateChange = new Date();
    this.halfOpenCalls = 0;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    if (previousState !== CircuitState.HALF_OPEN) {
      logger.info(`Circuit breaker ${this.name} transitioned to HALF_OPEN`);
      this.emit('state:changed', {
        circuitBreaker: this.name,
        previousState,
        currentState: this.state,
        timestamp: this.lastStateChange
      });
    }
  }

  /**
   * Reset metrics
   */
  private resetMetrics(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.slowCallCount = 0;
    this.totalCalls = 0;
    this.halfOpenCalls = 0;
    this.responseTimes = [];
    this.lastFailureTime = null;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    this.removeAllListeners();
  }
}