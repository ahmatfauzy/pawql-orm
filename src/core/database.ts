
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
