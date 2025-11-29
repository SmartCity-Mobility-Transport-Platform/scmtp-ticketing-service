import { createClient, RedisClientType } from 'redis';
import { config } from '../../config';
import logger from '../../utils/logger';

let redisClient: RedisClientType | null = null;

export const getRedisClient = async (): Promise<RedisClientType> => {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  redisClient = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
    },
    password: config.redis.password,
  });

  redisClient.on('error', (err) => {
    logger.error('Redis Client Error', err);
  });

  redisClient.on('connect', () => {
    logger.info('Redis Client Connected');
  });

  redisClient.on('ready', () => {
    logger.info('Redis Client Ready');
  });

  await redisClient.connect();
  return redisClient;
};

export const redis = {
  get: async <T>(key: string): Promise<T | null> => {
    try {
      const client = await getRedisClient();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis GET error', { key, error });
      return null;
    }
  },

  set: async <T>(key: string, value: T, ttlSeconds?: number): Promise<void> => {
    try {
      const client = await getRedisClient();
      const stringValue = JSON.stringify(value);
      
      if (ttlSeconds) {
        await client.setEx(key, ttlSeconds, stringValue);
      } else {
        await client.set(key, stringValue);
      }
    } catch (error) {
      logger.error('Redis SET error', { key, error });
    }
  },

  del: async (key: string): Promise<void> => {
    try {
      const client = await getRedisClient();
      await client.del(key);
    } catch (error) {
      logger.error('Redis DEL error', { key, error });
    }
  },

  delPattern: async (pattern: string): Promise<void> => {
    try {
      const client = await getRedisClient();
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (error) {
      logger.error('Redis DEL pattern error', { pattern, error });
    }
  },

  exists: async (key: string): Promise<boolean> => {
    try {
      const client = await getRedisClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error', { key, error });
      return false;
    }
  },

  close: async (): Promise<void> => {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
      logger.info('Redis connection closed');
    }
  },
};

export default redis;

// Cache key generators
export const cacheKeys = {
  userTickets: (userId: string) => `user:${userId}:tickets`,
  ticketDetails: (bookingId: string) => `ticket:${bookingId}`,
  scheduleAvailability: (scheduleId: string) => `schedule:${scheduleId}:availability`,
};

