import { DatabaseAdapter, QueryResult } from "../core/adapter.js";
import type { Pool, PoolOptions, Connection } from "mysql2/promise";

/**
 * Adapter for MySQL and MariaDB databases.
 * Wraps `mysql2`'s connection pool.
 *
 * @example
 * ```typescript
 * import { MysqlAdapter } from 'pawql';
 *
 * const adapter = new MysqlAdapter({
 *   host: 'localhost',
 *   user: 'root',
 *   database: 'mydb',
 * });
 * ```
 */
export class MysqlAdapter implements DatabaseAdapter {
  private _pool?: Pool;
  private _connection?: Connection | Pool; // For transactions or pre-created connection
  private _poolConfig?: PoolOptions;

  constructor(configOrPool: PoolOptions | Pool) {
    // If it's a Pool (has query/execute methods), use it directly
    if (configOrPool && "execute" in configOrPool && "getConnection" in configOrPool) {
      this._pool = configOrPool as Pool;
      this._connection = this._pool;
    } else {
      this._poolConfig = configOrPool as PoolOptions;
    }
  }

  /**
   * Internal constructor for transactions.
   * @internal
   */
  static _fromConnection(connection: Connection): MysqlAdapter {
    const adapter = new MysqlAdapter(null as any);
    adapter._connection = connection;
    adapter._pool = undefined;
    return adapter;
  }

  private async _getConn(): Promise<Connection | Pool> {
    if (this._connection) return this._connection;
    
    // Lazy init pool
    if (!this._pool && this._poolConfig) {
      try {
        const mysql = await import("mysql2/promise");
        this._pool = mysql.createPool(this._poolConfig);
        this._connection = this._pool;
      } catch (e) {
        throw new Error("Could not load mysql2/promise. Please install it with: npm install mysql2");
      }
    }
    
    return this._connection!;
  }

  get dialect() {
    return 'mysql';
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const conn = await this._getConn();
    
    // Convert PostgreSQL parameter $1, $2 to MySQL ? placeholders
    const mysqlSql = sql.replace(/\$\d+/g, "?");
    
    const [rows] = await conn.execute(mysqlSql, params || []);

    if (Array.isArray(rows)) {
      return { rows: rows as unknown as T[], rowCount: rows.length };
    } else {
      const header = rows as any;
      return {
        rows: [] as unknown as T[],
        rowCount: header.affectedRows || 0,
      };
    }
  }

  async transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T> {
    // If we are already in a transaction connection, just run callback
    if (!this._pool) {
      return callback(this);
    }
    
    const conn = await this._pool.getConnection();
    await conn.beginTransaction();

    try {
      const trxAdapter = MysqlAdapter._fromConnection(conn);
      const result = await callback(trxAdapter);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async close(): Promise<void> {
    if (this._pool && typeof this._pool.end === "function") {
      await this._pool.end();
    }
  }
}

