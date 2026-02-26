
/**
 * PawQL Logger module.
 *
 * Provides a pluggable logging interface for inspecting generated SQL queries.
 * The logger can be attached to a database instance to observe all queries
 * executed through the adapter.
 *
 * @module logger
 */

/**
 * Logger interface for PawQL query logging.
 * Implement this interface to create a custom logger.
 *
 * @example
 * ```typescript
 * const myLogger: PawQLLogger = {
 *   query(sql, params, durationMs) {
 *     console.log(`[${durationMs}ms] ${sql}`);
 *   }
 * };
 * ```
 */
export interface PawQLLogger {
  /**
   * Called after each query is executed.
   * @param sql - The SQL query string
   * @param params - The parameterized values
   * @param durationMs - The execution time in milliseconds
   */
  query(sql: string, params: any[] | undefined, durationMs: number): void;
}

/**
 * Built-in console logger with colored output.
 * Logs queries to `stdout` in a developer-friendly format.
 *
 * @example
 * ```typescript
 * import { createDB, consoleLogger } from 'pawql';
 *
 * const db = createDB(schema, adapter, { logger: consoleLogger });
 * ```
 */
export const consoleLogger: PawQLLogger = {
  query(sql: string, params: any[] | undefined, durationMs: number): void {
    const time = `\x1b[90m[${durationMs.toFixed(1)}ms]\x1b[0m`;
    const sqlColored = `\x1b[36m${sql}\x1b[0m`;
    const paramsStr = params && params.length > 0
      ? `\x1b[33m${JSON.stringify(params)}\x1b[0m`
      : "";
    console.log(`${time} ${sqlColored} ${paramsStr}`);
  },
};

/**
 * A silent logger that discards all output.
 * Useful for disabling logging in production.
 */
export const silentLogger: PawQLLogger = {
  query() {},
};
