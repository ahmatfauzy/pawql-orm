
import { DatabaseAdapter, QueryResult } from "../core/adapter";

export class DummyAdapter implements DatabaseAdapter {
  private _logs: { sql: string; params: any[] }[] = [];

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    console.log(`[DummyAdapter] SQL: ${sql} Params:`, params);
    this._logs.push({ sql, params: params || [] });
    // Return empty result for now
    return {
      rows: [],
      rowCount: 0
    };
  }

  async close(): Promise<void> {
    console.log("[DummyAdapter] Closing database connection.");
  }

  get logs() {
    return this._logs;
  }
}
