import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { DatabaseConnection } from '../../database/connection.js';

// Mock mongoose
vi.mock('mongoose', () => ({
  default: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    connection: {
      readyState: 1,
      on: vi.fn(),
      off: vi.fn()
    }
  }
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('DatabaseConnection', () => {
  let dbConnection: DatabaseConnection;
  const mockMongoose = mongoose as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance
    (DatabaseConnection as any).instance = undefined;
    dbConnection = DatabaseConnection.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = DatabaseConnection.getInstance();
      const instance2 = DatabaseConnection.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('connect', () => {
    it('should connect successfully on first attempt', async () => {
      mockMongoose.connect.mockResolvedValueOnce(undefined);

      await dbConnection.connect('mongodb://localhost:27017/test');

      expect(mockMongoose.connect).toHaveBeenCalledWith(
        'mongodb://localhost:27017/test',
        expect.objectContaining({
          maxPoolSize: 10,
          minPoolSize: 2,
          maxIdleTimeMS: 30000,
          serverSelectionTimeoutMS: 5000
        })
      );
    });

    it('should use default URI when none provided', async () => {
      mockMongoose.connect.mockResolvedValueOnce(undefined);
      
      // Mock process.env
      const originalEnv = process.env.MONGODB_URI;
      delete process.env.MONGODB_URI;

      await dbConnection.connect();

      expect(mockMongoose.connect).toHaveBeenCalledWith(
        'mongodb://localhost:27017/ml-e-tutoring',
        expect.any(Object)
      );

      // Restore env
      if (originalEnv) {
        process.env.MONGODB_URI = originalEnv;
      }
    });

    it('should use environment URI when available', async () => {
      mockMongoose.connect.mockResolvedValueOnce(undefined);
      
      const originalEnv = process.env.MONGODB_URI;
      process.env.MONGODB_URI = 'mongodb://env-uri:27017/test';

      await dbConnection.connect();

      expect(mockMongoose.connect).toHaveBeenCalledWith(
        'mongodb://env-uri:27017/test',
        expect.any(Object)
      );

      // Restore env
      if (originalEnv) {
        process.env.MONGODB_URI = originalEnv;
      } else {
        delete process.env.MONGODB_URI;
      }
    });

    it('should retry on connection failure', async () => {
      const connectionError = new Error('Connection failed');
      mockMongoose.connect
        .mockRejectedValueOnce(connectionError)
        .mockRejectedValueOnce(connectionError)
        .mockResolvedValueOnce(undefined);

      // Mock setTimeout to resolve immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      await dbConnection.connect('mongodb://localhost:27017/test', {
        maxRetries: 3,
        retryDelay: 100
      });

      expect(mockMongoose.connect).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries exceeded', async () => {
      const connectionError = new Error('Connection failed');
      mockMongoose.connect.mockRejectedValue(connectionError);

      // Mock setTimeout to resolve immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      await expect(
        dbConnection.connect('mongodb://localhost:27017/test', {
          maxRetries: 2,
          retryDelay: 100
        })
      ).rejects.toThrow('Failed to connect to MongoDB after 2 attempts');

      expect(mockMongoose.connect).toHaveBeenCalledTimes(2);
    });

    it('should not reconnect if already connected', async () => {
      mockMongoose.connect.mockResolvedValueOnce(undefined);

      // First connection
      await dbConnection.connect('mongodb://localhost:27017/test');
      
      // Second connection attempt
      await dbConnection.connect('mongodb://localhost:27017/test');

      expect(mockMongoose.connect).toHaveBeenCalledTimes(1);
    });

    it('should use custom connection options', async () => {
      mockMongoose.connect.mockResolvedValueOnce(undefined);

      await dbConnection.connect('mongodb://localhost:27017/test', {
        maxPoolSize: 20,
        minPoolSize: 5,
        maxIdleTimeMS: 60000,
        serverSelectionTimeoutMS: 10000
      });

      expect(mockMongoose.connect).toHaveBeenCalledWith(
        'mongodb://localhost:27017/test',
        expect.objectContaining({
          maxPoolSize: 20,
          minPoolSize: 5,
          maxIdleTimeMS: 60000,
          serverSelectionTimeoutMS: 10000
        })
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect when connected', async () => {
      mockMongoose.connect.mockResolvedValueOnce(undefined);
      mockMongoose.disconnect.mockResolvedValueOnce(undefined);

      await dbConnection.connect('mongodb://localhost:27017/test');
      await dbConnection.disconnect();

      expect(mockMongoose.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should not disconnect when not connected', async () => {
      mockMongoose.disconnect.mockResolvedValueOnce(undefined);

      await dbConnection.disconnect();

      expect(mockMongoose.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('getConnectionState', () => {
    it('should return mongoose connection state', () => {
      mockMongoose.connection.readyState = 1;

      const state = dbConnection.getConnectionState();

      expect(state).toBe(1);
    });
  });

  describe('isHealthy', () => {
    it('should return true when connected and ready', async () => {
      mockMongoose.connect.mockResolvedValueOnce(undefined);
      mockMongoose.connection.readyState = 1;

      await dbConnection.connect('mongodb://localhost:27017/test');

      const isHealthy = dbConnection.isHealthy();

      expect(isHealthy).toBe(true);
    });

    it('should return false when not connected', () => {
      mockMongoose.connection.readyState = 0;

      const isHealthy = dbConnection.isHealthy();

      expect(isHealthy).toBe(false);
    });

    it('should return false when connection state is not ready', async () => {
      mockMongoose.connect.mockResolvedValueOnce(undefined);
      mockMongoose.connection.readyState = 2; // connecting

      await dbConnection.connect('mongodb://localhost:27017/test');

      const isHealthy = dbConnection.isHealthy();

      expect(isHealthy).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle connection errors gracefully', async () => {
      const connectionError = new Error('Network error');
      mockMongoose.connect.mockRejectedValue(connectionError);

      // Mock setTimeout to resolve immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      await expect(
        dbConnection.connect('mongodb://localhost:27017/test', {
          maxRetries: 1,
          retryDelay: 10
        })
      ).rejects.toThrow('Failed to connect to MongoDB after 1 attempts');
    });

    it('should handle disconnect errors gracefully', async () => {
      mockMongoose.connect.mockResolvedValueOnce(undefined);
      mockMongoose.disconnect.mockRejectedValueOnce(new Error('Disconnect error'));

      await dbConnection.connect('mongodb://localhost:27017/test');

      // Should propagate the error
      await expect(dbConnection.disconnect()).rejects.toThrow('Disconnect error');
    });
  });
});