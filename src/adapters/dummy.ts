
import { DatabaseAdapter, QueryResult } from "../core/adapter.js";

/**
 * A test/mock adapter that records all queries without executing them.
 * Queries are logged to an internal array for assertion in tests.
 *
 * @example
 * ```typescript
 * import { DummyAdapter } from 'pawql/testing';
 *
 * const adapter = new DummyAdapter();
 * const db = createDB(schema, adapter);
 *
 * await db.query('users').where({ id: 1 }).execute();
 *
 * // Assert on generated SQL
 * assert.strictEqual(adapter.logs[0].sql, 'SELECT * FROM "users" WHERE "id" = $1');
 * assert.deepStrictEqual(adapter.logs[0].params, [1]);
 * ```
 */
export class DummyAdapter implements DatabaseAdapter {
  private _logs: { sql: string; params: any[] }[] = [];

  /**
   * Create a new DummyAdapter.
   * @param logsRef - Optional shared log array (used internally for transaction child adapters)
   */
  constructor(logsRef?: { sql: string; params: any[] }[]) {
    if (logsRef) {
      this._logs = logsRef;
    }
  }

  /**
   * Record a query without executing it.
   * Always returns an empty result set.
   *
   * @typeParam T - The expected row type (unused in dummy)
   * @param sql - The SQL query string
   * @param params - The parameterized values
   * @returns An empty `QueryResult`
   */
  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    console.log(`[DummyAdapter] SQL: ${sql} Params:`, params);
    this._logs.push({ sql, params: params || [] });
    return {
      rows: [],
      rowCount: 0
    };
  }

  /**
   * Simulate a database transaction.
   * Records `BEGIN`, executes the callback, then records `COMMIT` or `ROLLBACK`.
   *
   * @typeParam T - The return type of the callback
   * @param callback - Function to execute within the simulated transaction
   * @returns The value returned by the callback
   */
  async transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T> {
    console.log("[DummyAdapter] transaction start");
    this._logs.push({ sql: 'BEGIN', params: [] });
    
    try {
      // Pass a new DummyAdapter that shares the same log reference
      // so we can assert on all logs in one place
      const trxAdapter = new DummyAdapter(this._logs);
      const result = await callback(trxAdapter);
      
      this._logs.push({ sql: 'COMMIT', params: [] });
      console.log("[DummyAdapter] transaction commit");
      return result;
    } catch (e) {
      this._logs.push({ sql: 'ROLLBACK', params: [] });
      console.log("[DummyAdapter] transaction rollback");
      throw e;
    }
  }

  /**
   * No-op close for the dummy adapter.
   */
  async close(): Promise<void> {
    console.log("[DummyAdapter] Closing database connection.");
  }

  /**
   * Array of all recorded queries.
   * Each entry has `sql` (the query string) and `params` (the parameter values).
   */
  get logs() {
    return this._logs;
  }
}
