import { Router } from 'express';
import commandsRouter from './commands';
import queriesRouter from './queries';
import healthRouter from './health';

const router = Router();

// Mount routes
router.use('/tickets/commands', commandsRouter);
router.use('/tickets/queries', queriesRouter);
router.use('/health', healthRouter);

export default router;

