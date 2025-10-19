import { logger } from '../utils/logger.js';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: string[];
  nonRetryableErrors?: string[];
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalTime: number;
  errors: Error[];
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly errors: Error[]
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

export class RetryService {
  private static readonly DEFAULT_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    retryableErrors: [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN'
    ]
  };

  /**
   * Execute function with retry logic and exponential backoff
   */
  public static async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context?: string
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...RetryService.DEFAULT_CONFIG, ...config };
    const errors: Error[] = [];
    const startTime = Date.now();
    
    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        const result = await fn();
        const totalTime = Date.now() - startTime;
        
        if (attempt > 1) {
          logger.info(`Retry succeeded on attempt ${attempt}${context ? ` for ${context}` : ''}`);
        }
        
        return {
          result,
          attempts: attempt,
          totalTime,
          errors
        };
      } catch (error) {
        const err = error as Error;
        errors.push(err);
        
        logger.warn(`Attempt ${attempt} failed${context ? ` for ${context}` : ''}: ${err.message}`);
        
        // Check if error is retryable
        if (!RetryService.isRetryableError(err, finalConfig)) {
          logger.error(`Non-retryable error encountered${context ? ` for ${context}` : ''}: ${err.message}`);
          throw new RetryError(
            `Non-retryable error: ${err.message}`,
            attempt,
            errors
          );
        }
        
        // If this was the last attempt, throw retry error
        if (attempt === finalConfig.maxAttempts) {
          const totalTime = Date.now() - startTime;
          logger.error(`All ${finalConfig.maxAttempts} retry attempts failed${context ? ` for ${context}` : ''}`);
          throw new RetryError(
            `Failed after ${finalConfig.maxAttempts} attempts. Last error: ${err.message}`,
            attempt,
            errors
          );
        }
        
        // Calculate delay for next attempt
        const delay = RetryService.calculateDelay(attempt, finalConfig);
        logger.debug(`Waiting ${delay}ms before retry attempt ${attempt + 1}${context ? ` for ${context}` : ''}`);
        
        await RetryService.sleep(delay);
      }
    }
    
    // This should never be reached, but TypeScript requires it
    throw new RetryError('Unexpected retry loop exit', finalConfig.maxAttempts, errors);
  }

  /**
   * Execute function with simple retry (no exponential backoff)
   */
  public static async executeWithSimpleRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000,
    context?: string
  ): Promise<T> {
    const config: RetryConfig = {
      maxAttempts,
      baseDelay: delay,
      maxDelay: delay,
      backoffMultiplier: 1,
      jitter: false
    };
    
    const result = await RetryService.executeWithRetry(fn, config, context);
    return result.result;
  }

  /**
   * Create a retryable version of a function
   */
  public static createRetryableFunction<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    config: Partial<RetryConfig> = {},
    context?: string
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const result = await RetryService.executeWithRetry(
        () => fn(...args),
        config,
        context
      );
      return result.result;
    };
  }

  /**
   * Check if an error is retryable
   */
  private static isRetryableError(error: Error, config: RetryConfig): boolean {
    // If non-retryable errors are specified and this error matches, don't retry
    if (config.nonRetryableErrors) {
      for (const nonRetryableError of config.nonRetryableErrors) {
        if (error.message.includes(nonRetryableError) || error.name === nonRetryableError) {
          return false;
        }
      }
    }
    
    // If retryable errors are specified, only retry if error matches
    if (config.retryableErrors) {
      for (const retryableError of config.retryableErrors) {
        if (error.message.includes(retryableError) || error.name === retryableError) {
          return true;
        }
      }
      return false;
    }
    
    // Default: retry most errors except specific non-retryable ones
    const nonRetryablePatterns = [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'BadRequestError',
      'NotFoundError',
      'ConflictError'
    ];
    
    for (const pattern of nonRetryablePatterns) {
      if (error.name.includes(pattern) || error.message.includes(pattern)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private static calculateDelay(attempt: number, config: RetryConfig): number {
    // Calculate exponential backoff delay
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, config.maxDelay);
    
    // Add jitter if enabled
    if (config.jitter) {
      // Add random jitter up to 25% of the delay
      const jitterAmount = delay * 0.25;
      const jitter = Math.random() * jitterAmount;
      delay += jitter;
    }
    
    return Math.floor(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a timeout wrapper for promises
   */
  public static withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage?: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(timeoutMessage || `Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  }

  /**
   * Batch retry operations with concurrency control
   */
  public static async batchRetry<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    config: Partial<RetryConfig> = {},
    concurrency: number = 5
  ): Promise<Array<{ item: T; result?: R; error?: Error }>> {
    const results: Array<{ item: T; result?: R; error?: Error }> = [];
    
    // Process items in batches
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (item) => {
        try {
          const retryResult = await RetryService.executeWithRetry(
            () => fn(item),
            config,
            `batch item ${i + batch.indexOf(item)}`
          );
          return { item, result: retryResult.result };
        } catch (error) {
          return { item, error: error as Error };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }
}