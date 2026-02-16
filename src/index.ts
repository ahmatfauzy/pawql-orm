
/**
 * runtime-first, type-safe database query builder for Node.js
 */

export const number = Number;
export const string = String;
export const boolean = Boolean;
export const date = Date; // Avoid conflict with global Date constructor if possible, but JS allows shadowing

export type ColumnType = 
  | NumberConstructor
  | StringConstructor
  | BooleanConstructor
  | DateConstructor;

export type TableSchema = Record<string, ColumnType>;

export type InferColumnType<T> = 
  T extends NumberConstructor ? number :
  T extends StringConstructor ? string :
  T extends BooleanConstructor ? boolean :
  T extends DateConstructor ? Date :
  never;

export type InferTableSchema<T extends TableSchema> = {
  [K in keyof T]: InferColumnType<T[K]>;
};

export type DatabaseSchema<T> = {
  [K in keyof T]: T[K] extends TableSchema ? InferTableSchema<T[K]> : never;
};

export class Database<T extends Record<string, TableSchema>> {
  constructor(public schema: T) {}

  // Placeholder query method
  query<K extends keyof T & string>(tableName: K) {
    return {
      table: tableName,
      schema: this.schema[tableName],
      select: (...columns: (keyof InferTableSchema<T[K]>)[]): Partial<InferTableSchema<T[K]>> => {
          // This would return a query builder chain in a real implementation
          // For now, return a dummy object or throw
          throw new Error("Not implemented yet");
      }
    };
  }
}

export function createDB<T extends Record<string, TableSchema>>(schema: T): Database<T> {
  return new Database(schema);
}
