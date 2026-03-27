
import { DatabaseAdapter, QueryResult } from "./adapter.js";
import { DatabaseSchema, TableSchema, InferTableType, JsonType, UuidType, EnumType, ArrayType, ColumnConstructor, VarcharType, TextType, BigIntType, DecimalType } from "../types/schema.js";
import { QueryBuilder, SoftDeleteConfig } from "../query/builder.js";
import { PawQLLogger } from "./logger.js";
import { HookRegistry, HookEvent, HookCallback } from "./hooks.js";
import { RelationManager, RelationsSchema } from "./relations.js";

/**
 * A plugin for PawQL to extend or wrap database functionality.
 */
export interface PawQLPlugin {
  name: string;
  setup(db: Database<any>): void;
}

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

  /**
   * Soft delete configuration.
   * When enabled, queries will automatically filter out rows where `deleted_at IS NOT NULL`.
   *
   * @example
   * ```typescript
   * const db = createDB(schema, adapter, {
   *   softDelete: {
   *     tables: ['users', 'posts'],    // Tables with soft delete enabled
   *     column: 'deleted_at',           // Optional, default: 'deleted_at'
   *   }
   * });
   * ```
   */
  softDelete?: {
    /** Array of table names that support soft delete. */
    tables: string[];
    /**
     * Column name used for soft delete timestamps.
     * @default 'deleted_at'
     */
    column?: string;
  };

  /**
   * Relations configuration.
   * Define `hasMany`, `belongsTo`, and `hasOne` relationships for auto-joins via `.with()`.
   *
   * @example
   * ```typescript
   * import { createDB, defineRelations, hasMany, belongsTo } from 'pawql';
   *
   * const relations = defineRelations({
   *   users: { posts: hasMany('posts', 'userId') },
   *   posts: { author: belongsTo('users', 'userId') },
   * });
   *
   * const db = createDB(schema, adapter, { relations });
   *
   * // Auto-join
   * const usersWithPosts = await db.query('users').with('posts').execute();
   * ```
   */
  relations?: RelationsSchema;

  /**
   * Plugins to extend PawQL functionality.
   */
  plugins?: PawQLPlugin[];
}

/**
 * The main PawQL database class.
 * Provides type-safe query building, DDL generation, raw SQL execution,
 * transaction management, hooks, and relation-based auto-joins — all driven by the runtime schema.
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
  private _options?: DatabaseOptions;
  private _hookRegistry: HookRegistry;
  private _relationManager?: RelationManager;

  constructor(schema: TSchema, adapter: DatabaseAdapter, options?: DatabaseOptions) {
    this._schema = schema;
    this._adapter = options?.logger ? this._wrapAdapter(adapter, options.logger) : adapter;
    this._logger = options?.logger;
    this._options = options;
    this._hookRegistry = new HookRegistry();

    if (options?.relations) {
      this._relationManager = new RelationManager(options.relations);
    }
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
    const softDeleteConfig = this._getSoftDeleteConfig(tableName);
    return new QueryBuilder<InferTableType<TSchema[K]>, InferTableType<TSchema[K]>, TSchema>(
      tableName,
      this._adapter,
      softDeleteConfig,
      this._relationManager,
      this._hookRegistry
    );
  }

  /**
   * Register a lifecycle hook on a specific table (or all tables with `'*'`).
   *
   * Supported events:
   * - `beforeInsert`, `afterInsert`
   * - `beforeUpdate`, `afterUpdate`
   * - `beforeDelete`, `afterDelete`
   * - `beforeSelect`, `afterSelect`
   *
   * @param table - The table name, or `'*'` for all tables
   * @param event - The lifecycle event
   * @param callback - The hook function
   *
   * @example
   * ```typescript
   * db.hook('users', 'beforeInsert', (ctx) => {
   *   // Auto-add timestamp
   *   if (ctx.data && !Array.isArray(ctx.data)) {
   *     ctx.data.createdAt = new Date();
   *   }
   * });
   *
   * db.hook('*', 'afterInsert', (ctx) => {
   *   console.log(`Inserted into ${ctx.table}`);
   * });
   * ```
   */
  hook(table: string, event: HookEvent, callback: HookCallback): void {
    this._hookRegistry.on(table, event, callback);
  }

  /**
   * Remove hooks for a specific table (and optionally a specific event).
   *
   * @param table - The table name or '*'
   * @param event - Optional event filter
   */
  unhook(table: string, event?: HookEvent): void {
    this._hookRegistry.off(table, event);
  }

  /**
   * Access the hook registry for advanced manipulation.
   */
  get hookRegistry(): HookRegistry {
    return this._hookRegistry;
  }

  /**
   * Get the soft delete config for a specific table.
   * @internal
   */
  private _getSoftDeleteConfig(tableName: string): SoftDeleteConfig | undefined {
    if (!this._options?.softDelete) return undefined;
    const { tables, column } = this._options.softDelete;
    if (!tables.includes(tableName)) return undefined;
    return { enabled: true, column: column || 'deleted_at' };
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
      quote(identifier: string): string {
        return adapter.quote(identifier);
      },
      get dialect() {
        return adapter.dialect;
      }
    };
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
        const quotedCol = this._adapter.quote(colName);
        
        let sql = `${quotedCol} `;
        
        // Determine type and attributes
        let type: any;
        let isNullable = false;
        let isPrimaryKey = false;
        let defaultValue: any = undefined;

        if (typeof schema === 'function') {
          type = schema;
        } else if (schema instanceof JsonType) {
          type = schema;
        } else if (schema instanceof UuidType) {
          type = schema;
        } else if (schema instanceof EnumType) {
          type = schema;
        } else if (schema instanceof ArrayType) {
          type = schema;
        } else if (schema instanceof VarcharType || schema instanceof TextType || schema instanceof BigIntType || schema instanceof DecimalType) {
          type = schema;
        } else {
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
        else if (type instanceof VarcharType) sql += `VARCHAR(${type.length})`;
        else if (type instanceof TextType) sql += "TEXT";
        else if (type instanceof BigIntType) sql += "BIGINT";
        else if (type instanceof DecimalType) sql += `DECIMAL(${type.precision}, ${type.scale})`;
        else if (type instanceof ArrayType) {
          const itemType = type.itemType;
          if (itemType === Number) sql += "INTEGER[]";
          else if (itemType === String) sql += "TEXT[]";
          else if (itemType === Boolean) sql += "BOOLEAN[]";
          else if (itemType === Date) sql += "TIMESTAMP[]";
          else throw new Error(`Unsupported array item type for column ${tableName}.${colName}`);
        }
        else throw new Error(`Unsupported type for column ${tableName}.${colName}`);

        if (isPrimaryKey) sql += " PRIMARY KEY";
        if (!isNullable && !isPrimaryKey) sql += " NOT NULL";
        
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

      const createTableSql = `CREATE TABLE IF NOT EXISTS ${this._adapter.quote(tableName)} (\n  ${columns.join(',\n  ')}\n);`;
      await this._adapter.query(createTableSql);
    }
  }

  /**
   * Run a callback within a database transaction.
   * The callback receives a new `Database` instance scoped to the transaction.
   * If the callback throws, the transaction is automatically rolled back.
   * Hooks and relations are preserved in the transaction scope.
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
      const txDb = new Database(this._schema, trxAdapter, this._options);
      // Share the hook registry with the transaction
      (txDb as any)._hookRegistry = this._hookRegistry;
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
 * @param options - Optional configuration (logger, hooks, relations, etc.)
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
  const db = new Database(schema, adapter, options);
  if (options?.plugins) {
    for (const plugin of options.plugins) {
      plugin.setup(db);
    }
  }
  return db;
}

/**
 * Creates a database instance resolving the adapter automatically using a connection URL.
 * It uses lazy imports to prevent importing drivers that aren't installed.
 *
 * @example
 * ```typescript
 * const db = await connect(schema, 'postgres://user:pass@localhost:5432/mydb');
 * ```
 */
export async function connect<TSchema extends DatabaseSchema>(
  schema: TSchema,
  url: string,
  options?: DatabaseOptions
): Promise<Database<TSchema>> {
  let adapter: DatabaseAdapter;

  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const { PostgresAdapter } = await import('../adapters/pg.js');
    adapter = new PostgresAdapter({ connectionString: url });
  } else if (url.startsWith('mysql://')) {
    const { MysqlAdapter } = await import('../adapters/mysql.js');
    adapter = new MysqlAdapter({ uri: url });
  } else if (url.startsWith('sqlite://')) {
    const { SqliteAdapter } = await import('../adapters/sqlite.js');
    adapter = new SqliteAdapter(url.replace('sqlite://', ''));
  } else {
    throw new Error(`Unsupported Database URL dialect: ${url}`);
  }

  return createDB(schema, adapter, options);
}
