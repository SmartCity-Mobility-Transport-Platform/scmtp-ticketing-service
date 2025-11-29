import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import logger from './utils/logger';
import writeDb from './infrastructure/database/writeDb';
import readDb from './infrastructure/database/readDb';
import { disconnectKafka, createTopics, KAFKA_TOPICS, createConsumer } from './infrastructure/messaging/kafka';
import redis from './infrastructure/cache/redis';
import ticketProjector from './projections/ticketProjector';

const app: Application = express();

// Trust proxy (for rate limiting behind load balancer)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.env === 'production' 
    ? ['https://your-frontend-domain.com'] 
    : '*',
  credentials: true,
}));

// Request parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Compression
app.use(compression());

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

// API routes
app.use('/api', routes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info(`${signal} received, starting graceful shutdown...`);

  try {
    // Close Kafka connections
    await disconnectKafka();
    logger.info('Kafka disconnected');

    // Close Redis connection
    await redis.close();
    logger.info('Redis disconnected');

    // Close database connections
    await writeDb.close();
    await readDb.close();
    logger.info('Database connections closed');

    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Initialize Kafka topics
    logger.info('Creating Kafka topics...');
    await createTopics([
      KAFKA_TOPICS.TICKET_EVENTS,
      KAFKA_TOPICS.PAYMENT_EVENTS,
      KAFKA_TOPICS.WALLET_EVENTS,
    ]);

    // Start the projector consumer
    logger.info('Starting ticket projector consumer...');
    await createConsumer(
      `${config.kafka.groupId}-projector`,
      [KAFKA_TOPICS.TICKET_EVENTS],
      ticketProjector.processMessage
    );

    // Start HTTP server
    app.listen(config.port, config.host, () => {
      logger.info(`🚀 Ticketing Service started`, {
        port: config.port,
        host: config.host,
        env: config.env,
      });
      logger.info(`📖 API Endpoints:`);
      logger.info(`   POST /api/tickets/commands/book`);
      logger.info(`   POST /api/tickets/commands/reserve`);
      logger.info(`   POST /api/tickets/commands/confirm`);
      logger.info(`   POST /api/tickets/commands/cancel`);
      logger.info(`   GET  /api/tickets/queries/my-tickets`);
      logger.info(`   GET  /api/tickets/queries/:bookingId`);
      logger.info(`   GET  /api/health`);
      logger.info(`   GET  /api/health/ready`);
      logger.info(`   GET  /api/health/live`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

startServer();

export default app;

