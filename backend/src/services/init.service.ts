import { redisService } from './redis.service.js';
import { connectToDatabase } from '../database/connection.js';
import { logger } from '../utils/logger.js';

/**
 * Initialize all services
 */
export async function initializeServices(): Promise<void> {
  try {
    logger.info('Initializing services...');

    // Connect to MongoDB
    await connectToDatabase();
    logger.info('MongoDB connection established');

    // Connect to Redis
    await redisService.connect();
    logger.info('Redis connection established');

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
}

/**
 * Gracefully shutdown all services
 */
export async function shutdownServices(): Promise<void> {
  try {
    logger.info('Shutting down services...');

    // Disconnect from Redis
    await redisService.disconnect();
    logger.info('Redis connection closed');

    // MongoDB connection will be closed by mongoose
    logger.info('All services shut down successfully');
  } catch (error) {
    logger.error('Error during service shutdown:', error);
    throw error;
  }
}