import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { sessionRoutes } from './session.routes.js';
import { agentRoutes } from './agent.routes.js';
import { webSocketRoutes } from './websocket.routes.js';
import { requestLogger, apiRateLimit } from '../middleware/index.js';

const router = Router();

// Apply security middleware to all API routes
router.use(requestLogger);
router.use(apiRateLimit);

// Mount auth routes
router.use('/auth', authRoutes);

// Mount session routes
router.use('/sessions', sessionRoutes);

// Mount agent routes
router.use('/agents', agentRoutes);

// Mount WebSocket routes
router.use('/websocket', webSocketRoutes);

export { router as apiRoutes };