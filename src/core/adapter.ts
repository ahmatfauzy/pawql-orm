
/**
 * Interface for database adapters.
 * This allows genless to be database-agnostic while primarily targeting PostgreSQL first.
 */

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseAdapter {
  /**
   * Execute a raw SQL query with parameters.
   * @param sql The SQL string (use $1, $2, etc. for parameters)
   * @param params Verify that params match the placeholders
   */
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;

  /**
   * Disconnect from the database.
   */
  close(): Promise<void>;
}
