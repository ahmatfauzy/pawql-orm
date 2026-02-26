import { Pool, PoolClient, PoolConfig, QueryResult as PgQueryResult } from "pg";
import { DatabaseAdapter, QueryResult } from "../core/adapter.js";

/**
 * PostgreSQL pool configuration options.
 * Extends the standard `pg.PoolConfig` with documentation for the most commonly used options.
 *
 * @example
 * ```typescript
 * const adapter = new PostgresAdapter({
 *   connectionString: 'postgres://user:pass@localhost:5432/mydb',
 *   max: 20,
 *   idleTimeoutMillis: 30000,
 *   connectionTimeoutMillis: 5000,
 * });
 * ```
 */
export interface PawQLPoolConfig extends PoolConfig {
  /**
   * Maximum number of clients the pool should contain.
   * @default 10
   */
  max?: number;

  /**
   * Number of milliseconds a client can sit idle in the pool before being removed.
   * Set to `0` to disable auto-disconnection of idle clients.
   * @default 10000
   */
  idleTimeoutMillis?: number;

  /**
   * Number of milliseconds to wait before timing out when connecting a new client.
   * Set to `0` to disable timeout.
   * @default 0 (no timeout)
   */
  connectionTimeoutMillis?: number;

  /**
   * Number of milliseconds to wait for a query to complete before timing out.
   * @default undefined (no timeout)
   */
  statement_timeout?: number;

  /**
   * Whether to allow the pool to exceed `max` under load.
   * If `true`, the pool will allow unlimited clients.
   * @default false
   */
  allowExitOnIdle?: boolean;
}

/**
 * PostgreSQL adapter for PawQL.
 * Wraps the `pg` library's connection pool to implement the PawQL {@link DatabaseAdapter} interface.
 *
 * Accepts either:
 * - A {@link PawQLPoolConfig} to create a new pool
 * - An existing `pg.Pool` instance (for shared pools)
 * - A `pg.PoolClient` (for use within transactions)
 *
 * @example
 * ```typescript
 * import { PostgresAdapter } from 'pawql';
 *
 * // Using connection string
 * const adapter = new PostgresAdapter({
 *   connectionString: process.env.DATABASE_URL,
 * });
 *
 * // Using detailed config with pool options
 * const adapter = new PostgresAdapter({
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'mydb',
 *   user: 'postgres',
 *   password: 'secret',
 *   max: 20,                    // Max pool size
 *   idleTimeoutMillis: 30000,   // Close idle clients after 30s
 *   connectionTimeoutMillis: 5000,  // Timeout after 5s
 * });
 *
 * // Using existing Pool
 * import { Pool } from 'pg';
 * const pool = new Pool({ connectionString: '...' });
 * const adapter = new PostgresAdapter(pool);
 * ```
 */
export class PostgresAdapter implements DatabaseAdapter {
  private pool: Pool | null = null;
  private client: PoolClient | null = null;

  /**
   * Create a new PostgresAdapter.
   *
   * @param configOrPool - Pool configuration, existing Pool instance, or PoolClient for transactions
   */
  constructor(configOrPool: PawQLPoolConfig | Pool | PoolClient) {
    if (configOrPool instanceof Pool) {
      this.pool = configOrPool;
    } else if ((configOrPool as any).release && (configOrPool as any).query) {
       // Duck-type check for PoolClient
       this.client = configOrPool as PoolClient;
    } else {
      this.pool = new Pool(configOrPool as PawQLPoolConfig);
    }
  }

  /**
   * Execute a SQL query against the database.
   *
   * @typeParam T - The expected row type
   * @param sql - SQL query string with `$1`, `$2`, etc. placeholders
   * @param params - Parameter values matching the placeholders
   * @returns Query result with `rows` and `rowCount`
   */
  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const executor = this.client || this.pool;
    if (!executor) throw new Error("Adapter is closed or invalid");

    const result = await executor.query(sql, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0
    };
  }

  /**
   * Execute a callback within a database transaction.
   * Automatically handles `BEGIN`, `COMMIT`, and `ROLLBACK`.
   * Nested transactions are flattened (the inner callback shares the same client).
   *
   * @typeParam T - The return type of the callback
   * @param callback - Function to execute within the transaction
   * @returns The value returned by the callback
   */
  async transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T> {
    if (this.client) {
      // Already in a transaction (nested) — flatten
      return callback(this);
    }

    if (!this.pool) throw new Error("Cannot start transaction without a pool");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      
      // Create a temporary adapter sharing this client
      const trxAdapter = new PostgresAdapter(client);
      
      const result = await callback(trxAdapter);
      
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close the database connection pool and release all clients.
   * After calling this, the adapter can no longer execute queries.
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  /**
   * Get the current pool size (total clients in the pool).
   * Returns `0` if the adapter is using a direct client.
   */
  get poolSize(): number {
    return this.pool?.totalCount ?? 0;
  }

  /**
   * Get the number of idle clients in the pool.
   */
  get idleCount(): number {
    return this.pool?.idleCount ?? 0;
  }

  /**
   * Get the number of clients currently waiting for a connection.
   */
  get waitingCount(): number {
    return this.pool?.waitingCount ?? 0;
  }
}
