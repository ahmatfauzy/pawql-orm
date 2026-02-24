
import { DatabaseAdapter } from "./adapter.js";
import { DatabaseSchema, TableSchema, InferTableType, JsonType, UuidType, EnumType, ArrayType, ColumnConstructor } from "../types/schema.js";
import { QueryBuilder } from "../query/builder.js";

export class Database<TSchema extends DatabaseSchema> {
  private _schema: TSchema;
  private _adapter: DatabaseAdapter;

  constructor(schema: TSchema, adapter: DatabaseAdapter) {
    this._schema = schema;
    this._adapter = adapter;
  }

  /**
   * Start a query on a specific table.
   */
  query<K extends keyof TSchema & string>(tableName: K): QueryBuilder<InferTableType<TSchema[K]>, InferTableType<TSchema[K]>, TSchema> {
    // In a real implementation, we would validate that the table exists in the schema.
    return new QueryBuilder<InferTableType<TSchema[K]>, InferTableType<TSchema[K]>, TSchema>(tableName, this._adapter);
  }

  /**
   * Access the raw schema definition.
   */
  get schema(): TSchema {
    return this._schema;
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    await this._adapter.close();
  }

  /**
   * Execute a raw SQL query with parameterized values.
   * Escape hatch for custom SQL that the query builder doesn't support.
   *
   * @param sql The SQL string (use $1, $2, etc. for parameters)
   * @param params Parameter values matching the placeholders
   * @returns The query result with rows and rowCount
   *
   * @example
   * const result = await db.raw<{ id: number; name: string }>(
   *   'SELECT * FROM users WHERE id = $1',
   *   [1]
   * );
   * console.log(result.rows); // [{ id: 1, name: 'Alice' }]
   */
  async raw<T = any>(sql: string, params?: any[]): Promise<import("./adapter.js").QueryResult<T>> {
    return this._adapter.query<T>(sql, params);
  }

  // Helper to quote identifiers
  private _quote(identifier: string): string {
    if (identifier.startsWith('"')) return identifier;
    return `"${identifier}"`;
  }

  /**
    * Synchronize schema with database (DDL).
    * Creates tables if they don't exist.
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
   * Run a callback within a transaction.
   * The callback receives a new Database instance scoped to the transaction.
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
 * Factory function to create a new database instance.
 */
export function createDB<TSchema extends DatabaseSchema>(
  schema: TSchema,
  adapter: DatabaseAdapter
): Database<TSchema> {
  return new Database(schema, adapter);
}

