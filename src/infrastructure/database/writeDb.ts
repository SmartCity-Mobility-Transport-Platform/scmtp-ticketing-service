import { Pool, PoolClient } from 'pg';
import { config } from '../../config';
import logger from '../../utils/logger';

// PostgreSQL Write Database Pool
const writePool = new Pool({
  host: config.writeDb.host,
  port: config.writeDb.port,
  user: config.writeDb.user,
  password: config.writeDb.password,
  database: config.writeDb.database,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

writePool.on('connect', () => {
  logger.debug('New client connected to Write DB');
});

writePool.on('error', (err) => {
  logger.error('Unexpected error on Write DB idle client', err);
});

export const writeDb = {
  query: async <T>(text: string, params?: unknown[]): Promise<T[]> => {
    const start = Date.now();
    try {
      const result = await writePool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { text: text.substring(0, 100), duration, rows: result.rowCount });
      return result.rows as T[];
    } catch (error) {
      logger.error('Query error', { text: text.substring(0, 100), error });
      throw error;
    }
  },

  queryOne: async <T>(text: string, params?: unknown[]): Promise<T | null> => {
    const rows = await writeDb.query<T>(text, params);
    return rows[0] || null;
  },

  getClient: async (): Promise<PoolClient> => {
    return writePool.connect();
  },

  transaction: async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await writePool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  pool: writePool,

  close: async (): Promise<void> => {
    await writePool.end();
    logger.info('Write DB pool closed');
  },
};

export default writeDb;

