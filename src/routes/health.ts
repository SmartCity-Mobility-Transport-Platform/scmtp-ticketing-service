import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import writeDb from '../infrastructure/database/writeDb';
import readDb from '../infrastructure/database/readDb';
import logger from '../utils/logger';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  service: string;
  version: string;
  checks: {
    name: string;
    status: 'pass' | 'fail';
    message?: string;
    latency?: number;
  }[];
}

/**
 * GET /health
 * Basic health check
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({
    status: 'healthy',
    service: 'ticketing-service',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/live
 * Kubernetes liveness probe
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready
 * Kubernetes readiness probe - checks all dependencies
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const healthStatus: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ticketing-service',
    version: process.env.npm_package_version || '1.0.0',
    checks: [],
  };

  // Check Write DB
  try {
    const start = Date.now();
    await writeDb.query('SELECT 1');
    healthStatus.checks.push({
      name: 'write-database',
      status: 'pass',
      latency: Date.now() - start,
    });
  } catch (error) {
    healthStatus.checks.push({
      name: 'write-database',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    healthStatus.status = 'unhealthy';
  }

  // Check Read DB
  try {
    const start = Date.now();
    await readDb.query('SELECT 1');
    healthStatus.checks.push({
      name: 'read-database',
      status: 'pass',
      latency: Date.now() - start,
    });
  } catch (error) {
    healthStatus.checks.push({
      name: 'read-database',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    // Read DB failure = degraded (can still write)
    if (healthStatus.status === 'healthy') {
      healthStatus.status = 'degraded';
    }
  }

  const statusCode = healthStatus.status === 'healthy' 
    ? StatusCodes.OK 
    : healthStatus.status === 'degraded'
    ? StatusCodes.OK // Degraded is still considered ready
    : StatusCodes.SERVICE_UNAVAILABLE;

  if (healthStatus.status !== 'healthy') {
    logger.warn('Health check failed', healthStatus);
  }

  res.status(statusCode).json(healthStatus);
});

export default router;

