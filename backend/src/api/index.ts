import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { sessionRoutes } from './session.routes.js';
import { agentRoutes } from './agent.routes.js';
import { webSocketRoutes } from './websocket.routes.js';
import { requestLogger, apiRateLimit } from '../middleware/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Apply security middleware to all API routes
router.use(requestLogger);
router.use(apiRateLimit);

// Basic health check endpoint (no dependencies required)
router.get('/health', async (req, res) => {
    try {
        // Basic health info
        const healthInfo: any = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'ml-e-backend',
            uptime: process.uptime(),
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                unit: 'MB'
            },
            checks: {
                server: 'ok'
            }
        };

        // Try to check database connectivity (optional)
        try {
            const mongoose = await import('mongoose');
            if (mongoose.default.connection.readyState === 1) {
                healthInfo.checks.database = 'connected';
            } else {
                healthInfo.checks.database = 'disconnected';
                healthInfo.status = 'degraded';
            }
        } catch (dbError) {
            healthInfo.checks.database = 'unknown';
        }

        // Try to check Redis connectivity (optional)
        try {
            // We'll add Redis check later when Redis service is properly initialized
            healthInfo.checks.redis = 'unknown';
        } catch (redisError) {
            healthInfo.checks.redis = 'unknown';
        }

        const statusCode = healthInfo.status === 'ok' ? 200 : 503;
        res.status(statusCode).json(healthInfo);

    } catch (error) {
        logger.error('Health check error:', error);
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: 'Health check failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Liveness probe (simple check that server is running)
router.get('/health/liveness', (req, res) => {
    res.status(200).json({
        alive: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Readiness probe (check if server is ready to accept requests)
router.get('/health/readiness', async (req, res) => {
    try {
        const checks: any = {
            server: 'ok'
        };

        let ready = true;

        // Check database connectivity
        try {
            const mongoose = await import('mongoose');
            if (mongoose.default.connection.readyState === 1) {
                checks.database = 'connected';
            } else {
                checks.database = 'disconnected';
                ready = false;
            }
        } catch (dbError) {
            checks.database = 'error';
            ready = false;
        }

        const statusCode = ready ? 200 : 503;
        res.status(statusCode).json({
            ready,
            timestamp: new Date().toISOString(),
            checks
        });

    } catch (error) {
        logger.error('Readiness check error:', error);
        res.status(503).json({
            ready: false,
            timestamp: new Date().toISOString(),
            error: 'Readiness check failed'
        });
    }
});

// Mount auth routes
router.use('/auth', authRoutes);

// Mount session routes
router.use('/sessions', sessionRoutes);

// Mount agent routes
router.use('/agents', agentRoutes);

// Mount WebSocket routes
router.use('/websocket', webSocketRoutes);

// Mount profile routes
import { profileRoutes } from './profile.routes.js';
router.use('/profile', profileRoutes);

// Mount analytics routes
import { analyticsRoutes } from './analytics.routes.js';
router.use('/analytics', analyticsRoutes);

export { router as apiRoutes };