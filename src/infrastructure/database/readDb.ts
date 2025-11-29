import { Pool, PoolClient } from 'pg';
import { config } from '../../config';
import logger from '../../utils/logger';

// PostgreSQL Read Database Pool (CQRS Read Model)
const readPool = new Pool({
  host: config.readDb.host,
  port: config.readDb.port,
  user: config.readDb.user,
  password: config.readDb.password,
  database: config.readDb.database,
  max: 30, // Higher limit for read-heavy workloads
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

readPool.on('connect', () => {
  logger.debug('New client connected to Read DB');
});

readPool.on('error', (err) => {
  logger.error('Unexpected error on Read DB idle client', err);
});

export const readDb = {
  query: async <T>(text: string, params?: unknown[]): Promise<T[]> => {
    const start = Date.now();
    try {
      const result = await readPool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed read query', { text: text.substring(0, 100), duration, rows: result.rowCount });
      return result.rows as T[];
    } catch (error) {
      logger.error('Read query error', { text: text.substring(0, 100), error });
      throw error;
    }
  },

  queryOne: async <T>(text: string, params?: unknown[]): Promise<T | null> => {
    const rows = await readDb.query<T>(text, params);
    return rows[0] || null;
  },

  getClient: async (): Promise<PoolClient> => {
    return readPool.connect();
  },

  pool: readPool,

  close: async (): Promise<void> => {
    await readPool.end();
    logger.info('Read DB pool closed');
  },
};

export default readDb;

