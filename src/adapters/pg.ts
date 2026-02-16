
import { Pool, PoolConfig } from "pg";
import { DatabaseAdapter, QueryResult } from "../core/adapter";

export class PostgresAdapter implements DatabaseAdapter {
  private pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const result = await this.pool.query(sql, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
