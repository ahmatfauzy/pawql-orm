
import { DatabaseAdapter, QueryResult } from "./adapter.js";
import { DatabaseSchema, TableSchema, InferTableType, JsonType, UuidType, EnumType, ArrayType, ColumnConstructor } from "../types/schema.js";
import { QueryBuilder } from "../query/builder.js";
import { PawQLLogger } from "./logger.js";

/**
 * Configuration options for creating a PawQL database instance.
 */
export interface DatabaseOptions {
  /**
   * Optional logger to inspect generated SQL queries.
   * Use `consoleLogger` for colored output, or implement `PawQLLogger` for custom logging.
   *
   * @example
   * ```typescript
   * import { createDB, consoleLogger } from 'pawql';
   * const db = createDB(schema, adapter, { logger: consoleLogger });
   * ```
   */
  logger?: PawQLLogger;
}

/**
 * The main PawQL database class.
 * Provides type-safe query building, DDL generation, raw SQL execution,
 * and transaction management — all driven by the runtime schema.
 *
 * @typeParam TSchema - The database schema object type
 *
 * @example
 * ```typescript
 * const db = createDB({
 *   users: {
 *     id: { type: Number, primaryKey: true },
 *     name: String,
 *   }
 * }, adapter);
 *
 * const users = await db.query('users').where({ name: 'Alice' }).execute();
 * ```
 */
export class Database<TSchema extends DatabaseSchema> {
  private _schema: TSchema;
  private _adapter: DatabaseAdapter;
  private _logger?: PawQLLogger;

  constructor(schema: TSchema, adapter: DatabaseAdapter, options?: DatabaseOptions) {
    this._schema = schema;
    this._adapter = options?.logger ? this._wrapAdapter(adapter, options.logger) : adapter;
    this._logger = options?.logger;
  }

  /**
   * Start a type-safe query on a specific table.
   *
   * @typeParam K - The table name (inferred from schema keys)
   * @param tableName - The name of the table to query
   * @returns A new {@link QueryBuilder} scoped to the specified table
   *
   * @example
   * ```typescript
   * const users = await db.query('users')
   *   .select('id', 'name')
   *   .where({ isActive: true })
   *   .execute();
   * ```
   */
  query<K extends keyof TSchema & string>(tableName: K): QueryBuilder<InferTableType<TSchema[K]>, InferTableType<TSchema[K]>, TSchema> {
    return new QueryBuilder<InferTableType<TSchema[K]>, InferTableType<TSchema[K]>, TSchema>(tableName, this._adapter);
  }

  /**
   * Access the raw runtime schema definition.
   *
   * @returns The schema object passed to `createDB()`
   */
  get schema(): TSchema {
    return this._schema;
  }

  /**
   * Close the database connection and release resources.
   *
   * @example
   * ```typescript
   * await db.close();
   * ```
   */
  async close(): Promise<void> {
    await this._adapter.close();
  }

  /**
   * Execute a raw SQL query with parameterized values.
   * Escape hatch for custom SQL that the query builder doesn't support.
   *
   * @typeParam T - The expected row type
   * @param sql - The SQL string (use `$1`, `$2`, etc. for parameters)
   * @param params - Parameter values matching the placeholders
   * @returns The query result with `rows` and `rowCount`
   *
   * @example
   * ```typescript
   * const result = await db.raw<{ id: number; name: string }>(
   *   'SELECT * FROM users WHERE id = $1',
   *   [1]
   * );
   * console.log(result.rows); // [{ id: 1, name: 'Alice' }]
   * ```
   */
  async raw<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    return this._adapter.query<T>(sql, params);
  }

  /**
   * Wrap an adapter to add logging around every query call.
   * @internal
   */
  private _wrapAdapter(adapter: DatabaseAdapter, logger: PawQLLogger): DatabaseAdapter {
    return {
      async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
        const start = performance.now();
        const result = await adapter.query<T>(sql, params);
        const durationMs = performance.now() - start;
        logger.query(sql, params, durationMs);
        return result;
      },
      async transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T> {
        return adapter.transaction(callback);
      },
      async close(): Promise<void> {
        return adapter.close();
      },
    };
  }

  /**
   * Quote a SQL identifier (table or column name).
   * @internal
   */
  private _quote(identifier: string): string {
    if (identifier.startsWith('"')) return identifier;
    return `"${identifier}"`;
  }

  /**
   * Synchronize schema with database by creating tables if they don't exist.
   * Generates `CREATE TABLE IF NOT EXISTS` DDL for each table in the schema.
   *
   * @example
   * ```typescript
   * await db.createTables();
   * ```
   */
  async createTables(): Promise<void> {
    for (const [tableName, tableSchema] of Object.entries(this._schema)) {
      const columns: string[] = [];
      
      for (const [colName, colSchema] of Object.entries(tableSchema as any)) {
        const schema = colSchema as any; 
        const quotedCol = this._quote(colName);
        
        let sql = `${quotedCol} `;
        
        // Determine type and attributes
        let type: any;
        let isNullable = false;
        let isPrimaryKey = false;
        let defaultValue: any = undefined;

        if (typeof schema === 'function') {
          // Schema is just a constructor (e.g. Number)
          type = schema;
        } else if (schema instanceof JsonType) {
          type = schema;
        } else if (schema instanceof UuidType) {
          type = schema;
        } else if (schema instanceof EnumType) {
          type = schema;
        } else if (schema instanceof ArrayType) {
          type = schema;
        } else {
          // Schema is a complex definition object
          type = schema.type;
          isNullable = !!schema.nullable;
          isPrimaryKey = !!schema.primaryKey;
          defaultValue = schema.default;
        }

        // Map types to SQL
        if (type === Number) sql += "INTEGER";
        else if (type === String) sql += "TEXT";
        else if (type === Boolean) sql += "BOOLEAN";
        else if (type === Date) sql += "TIMESTAMP";
        else if (type instanceof JsonType) sql += "JSONB";
        else if (type instanceof UuidType) sql += "UUID";
        else if (type instanceof EnumType) {
          sql += "TEXT";
        }
        else if (type instanceof ArrayType) {
          // Map array item type to SQL base type
          const itemType = type.itemType;
          if (itemType === Number) sql += "INTEGER[]";
          else if (itemType === String) sql += "TEXT[]";
          else if (itemType === Boolean) sql += "BOOLEAN[]";
          else if (itemType === Date) sql += "TIMESTAMP[]";
          else throw new Error(`Unsupported array item type for column ${tableName}.${colName}`);
        }
        else throw new Error(`Unsupported type for column ${tableName}.${colName}`);

        // Add constraints
        if (isPrimaryKey) sql += " PRIMARY KEY";
        if (!isNullable && !isPrimaryKey) sql += " NOT NULL";
        
        // Enum CHECK constraint
        if (type instanceof EnumType && type.values.length > 0) {
          const allowed = type.values.map((v: string) => `'${v}'`).join(', ');
          sql += ` CHECK (${quotedCol} IN (${allowed}))`;
        }

        if (defaultValue !== undefined) {
          if (typeof defaultValue === 'string') sql += ` DEFAULT '${defaultValue.replace(/'/g, "''")}'`;
          else if (typeof defaultValue === 'number') sql += ` DEFAULT ${defaultValue}`;
          else if (typeof defaultValue === 'boolean') sql += ` DEFAULT ${defaultValue ? 'TRUE' : 'FALSE'}`;
          else if (defaultValue instanceof Date) sql += ` DEFAULT '${defaultValue.toISOString()}'`;
        }

        columns.push(sql);
      }

      const createTableSql = `CREATE TABLE IF NOT EXISTS ${this._quote(tableName)} (\n  ${columns.join(',\n  ')}\n);`;
      await this._adapter.query(createTableSql);
    }
  }

  /**
   * Run a callback within a database transaction.
   * The callback receives a new `Database` instance scoped to the transaction.
   * If the callback throws, the transaction is automatically rolled back.
   *
   * @typeParam T - The return type of the callback
   * @param callback - Function to execute within the transaction scope
   * @returns The value returned by the callback
   *
   * @example
   * ```typescript
   * await db.transaction(async (tx) => {
   *   await tx.query('users').insert({ id: 1, name: 'Alice' }).execute();
   *   await tx.query('posts').insert({ id: 1, userId: 1, title: 'Hello' }).execute();
   * });
   * ```
   */
  async transaction<T>(callback: (tx: Database<TSchema>) => Promise<T>): Promise<T> {
    return this._adapter.transaction(async (trxAdapter: DatabaseAdapter) => {
      // Create a lightweight copy of the DB class with the transaction adapter
      const txDb = new Database(this._schema, trxAdapter);
      return callback(txDb);
    });
  }
}

/**
 * Factory function to create a new PawQL database instance.
 *
 * @typeParam TSchema - The database schema type (inferred from the schema object)
 * @param schema - The runtime schema definition object
 * @param adapter - The database adapter (e.g. `PostgresAdapter`, `DummyAdapter`)
 * @param options - Optional configuration (logger, etc.)
 * @returns A fully typed {@link Database} instance
 *
 * @example
 * ```typescript
 * import { createDB, PostgresAdapter, consoleLogger } from 'pawql';
 *
 * const db = createDB({
 *   users: {
 *     id: { type: Number, primaryKey: true },
 *     name: String,
 *   }
 * }, new PostgresAdapter({ connectionString: process.env.DATABASE_URL }), {
 *   logger: consoleLogger,
 * });
 * ```
 */
export function createDB<TSchema extends DatabaseSchema>(
  schema: TSchema,
  adapter: DatabaseAdapter,
  options?: DatabaseOptions
): Database<TSchema> {
  return new Database(schema, adapter, options);
}
