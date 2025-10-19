import { Router, Request, Response } from 'express';
import { HealthCheckService, SystemHealth } from '../services/health-check.service.js';
import { CircuitBreakerManager } from '../services/circuit-breaker-manager.service.js';
import { logger } from '../utils/logger.js';

export interface HealthRouterDependencies {
  healthCheckService: HealthCheckService;
  circuitBreakerManager: CircuitBreakerManager;
}

export function createHealthRoutes(dependencies: HealthRouterDependencies): Router {
  const router = Router();
  const { healthCheckService, circuitBreakerManager } = dependencies;

  /**
   * GET /health - Basic health check endpoint
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const health = await healthCheckService.getCurrentHealth();
      
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json({
        status: health.status,
        timestamp: health.timestamp,
        uptime: health.uptime
      });
    } catch (error) {
      logger.error('Health check endpoint error:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: 'Health check failed'
      });
    }
  });

  /**
   * GET /health/detailed - Detailed health check with all components
   */
  router.get('/health/detailed', async (req: Request, res: Response) => {
    try {
      const health = await healthCheckService.getCurrentHealth();
      
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Detailed health check endpoint error:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: 'Detailed health check failed'
      });
    }
  });

  /**
   * GET /health/services - Health status of individual services
   */
  router.get('/health/services', async (req: Request, res: Response) => {
    try {
      const health = await healthCheckService.getCurrentHealth();
      
      res.json({
        status: health.status,
        timestamp: health.timestamp,
        services: health.services
      });
    } catch (error) {
      logger.error('Services health check endpoint error:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: 'Services health check failed'
      });
    }
  });

  /**
   * GET /health/agents - Health status of agents
   */
  router.get('/health/agents', async (req: Request, res: Response) => {
    try {
      const health = await healthCheckService.getCurrentHealth();
      
      res.json({
        status: health.status,
        timestamp: health.timestamp,
        agents: health.agents
      });
    } catch (error) {
      logger.error('Agents health check endpoint error:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: 'Agents health check failed'
      });
    }
  });

  /**
   * GET /health/circuit-breakers - Circuit breaker status
   */
  router.get('/health/circuit-breakers', async (req: Request, res: Response) => {
    try {
      const allMetrics = circuitBreakerManager.getAllMetrics();
      const globalMetrics = circuitBreakerManager.getGlobalMetrics();
      const systemSummary = circuitBreakerManager.getSystemHealthSummary();
      
      res.json({
        timestamp: new Date(),
        global: globalMetrics,
        summary: systemSummary,
        agents: allMetrics
      });
    } catch (error) {
      logger.error('Circuit breakers health check endpoint error:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: 'Circuit breakers health check failed'
      });
    }
  });

  /**
   * GET /health/system - System metrics
   */
  router.get('/health/system', async (req: Request, res: Response) => {
    try {
      const health = await healthCheckService.getCurrentHealth();
      
      res.json({
        status: health.status,
        timestamp: health.timestamp,
        system: health.system,
        uptime: health.uptime
      });
    } catch (error) {
      logger.error('System health check endpoint error:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: 'System health check failed'
      });
    }
  });

  /**
   * GET /health/service/:serviceName - Health of specific service
   */
  router.get('/health/service/:serviceName', async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      const serviceHealth = await healthCheckService.checkServiceHealth(serviceName);
      
      const statusCode = serviceHealth.status === 'healthy' ? 200 : 
                        serviceHealth.status === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json(serviceHealth);
    } catch (error) {
      logger.error(`Service health check endpoint error for ${req.params.serviceName}:`, error);
      res.status(404).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: `Service ${req.params.serviceName} not found or health check failed`
      });
    }
  });

  /**
   * POST /health/circuit-breakers/:agentId/reset - Reset circuit breaker for agent
   */
  router.post('/health/circuit-breakers/:agentId/reset', (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const success = circuitBreakerManager.resetAgentCircuitBreaker(agentId);
      
      if (success) {
        res.json({
          success: true,
          message: `Circuit breaker reset for agent ${agentId}`,
          timestamp: new Date()
        });
      } else {
        res.status(404).json({
          success: false,
          message: `Circuit breaker not found for agent ${agentId}`,
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error(`Circuit breaker reset error for agent ${req.params.agentId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset circuit breaker',
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /health/circuit-breakers/reset-all - Reset all circuit breakers
   */
  router.post('/health/circuit-breakers/reset-all', (req: Request, res: Response) => {
    try {
      circuitBreakerManager.resetAllCircuitBreakers();
      
      res.json({
        success: true,
        message: 'All circuit breakers reset',
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Reset all circuit breakers error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset all circuit breakers',
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /health/circuit-breakers/:agentId/force-open - Force open circuit breaker
   */
  router.post('/health/circuit-breakers/:agentId/force-open', (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const success = circuitBreakerManager.forceOpenAgentCircuitBreaker(agentId);
      
      if (success) {
        res.json({
          success: true,
          message: `Circuit breaker forced open for agent ${agentId}`,
          timestamp: new Date()
        });
      } else {
        res.status(404).json({
          success: false,
          message: `Circuit breaker not found for agent ${agentId}`,
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error(`Circuit breaker force open error for agent ${req.params.agentId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to force open circuit breaker',
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /health/readiness - Kubernetes readiness probe
   */
  router.get('/health/readiness', async (req: Request, res: Response) => {
    try {
      const health = await healthCheckService.getCurrentHealth();
      
      // Ready if system is healthy or degraded (but not unhealthy)
      const isReady = health.status !== 'unhealthy';
      
      if (isReady) {
        res.status(200).json({
          ready: true,
          status: health.status,
          timestamp: health.timestamp
        });
      } else {
        res.status(503).json({
          ready: false,
          status: health.status,
          timestamp: health.timestamp
        });
      }
    } catch (error) {
      logger.error('Readiness probe error:', error);
      res.status(503).json({
        ready: false,
        status: 'unhealthy',
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /health/liveness - Kubernetes liveness probe
   */
  router.get('/health/liveness', (req: Request, res: Response) => {
    try {
      // Simple liveness check - just verify the service is running
      res.status(200).json({
        alive: true,
        timestamp: new Date(),
        uptime: process.uptime()
      });
    } catch (error) {
      logger.error('Liveness probe error:', error);
      res.status(503).json({
        alive: false,
        timestamp: new Date()
      });
    }
  });

  return router;
}