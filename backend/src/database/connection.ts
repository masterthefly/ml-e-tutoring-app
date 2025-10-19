import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

interface ConnectionOptions {
  maxRetries?: number;
  retryDelay?: number;
  maxPoolSize?: number;
  minPoolSize?: number;
  maxIdleTimeMS?: number;
  serverSelectionTimeoutMS?: number;
}

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  async connect(uri?: string, options: ConnectionOptions = {}): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const {
      maxRetries = 5,
      retryDelay = 5000,
      maxPoolSize = 10,
      minPoolSize = 2,
      maxIdleTimeMS = 30000,
      serverSelectionTimeoutMS = 5000
    } = options;

    const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/ml-e-tutoring';

    this.connectionPromise = this.connectWithRetry(mongoUri, {
      maxRetries,
      retryDelay,
      maxPoolSize,
      minPoolSize,
      maxIdleTimeMS,
      serverSelectionTimeoutMS
    });

    return this.connectionPromise;
  }

  private async connectWithRetry(
    uri: string, 
    options: Required<ConnectionOptions>
  ): Promise<void> {
    let retries = 0;

    while (retries < options.maxRetries) {
      try {
        await mongoose.connect(uri, {
          maxPoolSize: options.maxPoolSize,
          minPoolSize: options.minPoolSize,
          maxIdleTimeMS: options.maxIdleTimeMS,
          serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
        });

        this.isConnected = true;
        this.setupEventHandlers();
        logger.info('Successfully connected to MongoDB');
        return;
      } catch (error) {
        retries++;
        logger.error(`MongoDB connection attempt ${retries} failed:`, error);

        if (retries >= options.maxRetries) {
          throw new Error(`Failed to connect to MongoDB after ${options.maxRetries} attempts`);
        }

        logger.info(`Retrying connection in ${options.retryDelay}ms...`);
        await this.delay(options.retryDelay);
      }
    }
  }

  private setupEventHandlers(): void {
    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      this.isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
      this.isConnected = true;
    });

    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await mongoose.disconnect();
      this.isConnected = false;
      this.connectionPromise = null;
      logger.info('Disconnected from MongoDB');
    }
  }

  getConnectionState(): number {
    return mongoose.connection.readyState;
  }

  isHealthy(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const dbConnection = DatabaseConnection.getInstance();
export { DatabaseConnection };

// Convenience function for connecting to database
export const connectToDatabase = (uri?: string, options?: ConnectionOptions) => {
  return dbConnection.connect(uri, options);
};