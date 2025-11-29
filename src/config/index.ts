import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3002', 10),
  host: process.env.HOST || '0.0.0.0',

  // PostgreSQL Write Database
  writeDb: {
    host: process.env.POSTGRES_WRITE_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_WRITE_PORT || '5435', 10),
    user: process.env.POSTGRES_WRITE_USER || 'scmtp',
    password: process.env.POSTGRES_WRITE_PASSWORD || 'scmtp',
    database: process.env.POSTGRES_WRITE_DB || 'ticketing_write',
  },

  // PostgreSQL Read Database (CQRS)
  readDb: {
    host: process.env.POSTGRES_READ_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_READ_PORT || '5435', 10),
    user: process.env.POSTGRES_READ_USER || 'scmtp',
    password: process.env.POSTGRES_READ_PASSWORD || 'scmtp',
    database: process.env.POSTGRES_READ_DB || 'ticketing_read',
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // Kafka
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'ticketing-service',
    groupId: process.env.KAFKA_GROUP_ID || 'ticketing-service-group',
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    issuer: process.env.JWT_ISSUER || 'scmtp-user-service',
  },

  // External Services
  services: {
    userService: process.env.USER_SERVICE_URL || 'http://localhost:3001',
    routeService: process.env.ROUTE_SERVICE_URL || 'http://localhost:3003',
    paymentService: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3004',
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'debug',
} as const;

export type Config = typeof config;

