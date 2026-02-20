
import { DatabaseAdapter } from "./adapter";
import { DatabaseSchema, TableSchema, InferTableType } from "../types/schema";
import { QueryBuilder } from "../query/builder";

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
  query<K extends keyof TSchema & string>(tableName: K): QueryBuilder<InferTableType<TSchema[K]>> {
    // In a real implementation, we would validate that the table exists in the schema.
    return new QueryBuilder<InferTableType<TSchema[K]>>(tableName, this._adapter);
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
    * Synchronize schema with database (DDL).
    * Creates tables if they don't exist.
    */
  async createTables(): Promise<void> {
    for (const [tableName, tableSchema] of Object.entries(this._schema)) {
      const columns: string[] = [];
      
      for (const [colName, colSchema] of Object.entries(tableSchema as any)) {
        // cast to any to iterate, but we know it's a TableSchema
        const schema = colSchema as any; 
        
        let sql = `${colName} `;
        
        // Determine type and attributes
        let type: any;
        let isNullable = false;
        let isPrimaryKey = false;
        let defaultValue: any = undefined;

        if (typeof schema === 'function') {
          // Schema is just a constructor (e.g. Number)
          type = schema;
        } else {
          // Schema is a complex definition object
          type = schema.type;
          isNullable = !!schema.nullable;
          isPrimaryKey = !!schema.primaryKey;
          defaultValue = schema.default;
        }

        // Map JS types to SQL types
        if (type === Number) sql += "INTEGER";
        else if (type === String) sql += "TEXT";
        else if (type === Boolean) sql += "BOOLEAN";
        else if (type === Date) sql += "TIMESTAMP";
        else throw new Error(`Unsupported type for column ${tableName}.${colName}`);

        // Add constraints
        if (isPrimaryKey) sql += " PRIMARY KEY";
        if (!isNullable && !isPrimaryKey) sql += " NOT NULL"; // Primary key implies Not Null usually
        
        if (defaultValue !== undefined) {
          if (typeof defaultValue === 'string') sql += ` DEFAULT '${defaultValue}'`;
          else if (typeof defaultValue === 'number') sql += ` DEFAULT ${defaultValue}`;
          else if (typeof defaultValue === 'boolean') sql += ` DEFAULT ${defaultValue ? 'TRUE' : 'FALSE'}`;
          else if (defaultValue instanceof Date) sql += ` DEFAULT '${defaultValue.toISOString()}'`;
        }

        columns.push(sql);
      }

      const createTableSql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columns.join(',\n  ')}\n);`;
      await this._adapter.query(createTableSql);
    }
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
