
/**
 * PawQL Database Adapter Interface.
 *
 * This module defines the core adapter contract that all database drivers must implement.
 * PawQL is database-agnostic — any database can be supported by implementing this interface.
 *
 * @module adapter
 */

/**
 * The result of a database query.
 *
 * @typeParam T - The row type
 */
export interface QueryResult<T = any> {
  /** Array of rows returned by the query. */
  rows: T[];
  /** Number of rows affected or returned. */
  rowCount: number;
}

/**
 * Interface that all PawQL database adapters must implement.
 * Provides methods for executing queries, managing transactions, and closing connections.
 *
 * @example
 * ```typescript
 * class MyAdapter implements DatabaseAdapter {
 *   async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> { ... }
 *   async transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T> { ... }
 *   async close(): Promise<void> { ... }
 * }
 * ```
 */
export interface DatabaseAdapter {
  /**
   * Execute a raw SQL query with parameters.
   *
   * @typeParam T - The expected row type
   * @param sql - The SQL string (use `$1`, `$2`, etc. for parameters)
   * @param params - Parameter values matching the placeholders
   * @returns The query result with `rows` and `rowCount`
   */
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;

  /**
   * Execute a callback within a database transaction.
   * The adapter is responsible for `BEGIN`, `COMMIT`, and `ROLLBACK`.
   *
   * @typeParam T - The return type of the callback
   * @param callback - Function to execute within the transaction scope
   * @returns The value returned by the callback
   */
  transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T>;

  /**
   * Disconnect from the database and release all resources.
   */
  close(): Promise<void>;
}
