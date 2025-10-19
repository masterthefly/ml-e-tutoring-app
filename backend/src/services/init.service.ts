import { redisService } from './redis.service.js';
import { connectToDatabase } from '../database/connection.js';
import { UserModel } from '../database/schemas/user.schema.js';
import { authService } from './auth.service.js';
import { openaiService } from './openai.service.js';
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

    // Create default users if they don't exist
    await createDefaultUsers();

    // Check OpenAI service status
    const openaiStatus = openaiService.getStatus();
    logger.info('OpenAI service status:', openaiStatus);

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
}

/**
 * Create default users for testing
 */
async function createDefaultUsers(): Promise<void> {
  try {
    // Check if default user already exists
    const existingUser = await UserModel.findOne({ 
      $or: [
        { username: 'student' },
        { email: 'student@example.com' }
      ]
    });

    if (existingUser) {
      logger.info('Default user already exists');
      return;
    }

    // Create default test user
    await authService.register({
      username: 'student',
      email: 'student@example.com',
      password: 'password123',
      grade: 10
    });

    logger.info('Default test user created:');
    logger.info('  Username: student');
    logger.info('  Email: student@example.com');
    logger.info('  Password: password123');
    logger.info('  Grade: 10');

  } catch (error) {
    logger.error('Failed to create default users:', error);
    // Don't throw - this shouldn't prevent app startup
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