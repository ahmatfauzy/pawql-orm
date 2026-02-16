
/**
 * Types and interfaces for defining database schemas at runtime.
 */

// Basic primitive constructors used as column definitions
export type ColumnConstructor = 
  | NumberConstructor
  | StringConstructor
  | BooleanConstructor
  | DateConstructor;

// Extended column definition for more complex types (nullable, default, etc.)
export interface ColumnDefinition<T = any> {
  name?: string; // Optional overridden column name
  type: ColumnConstructor;
  nullable?: boolean;
  primaryKey?: boolean;
  default?: T;
}

// A column can be a simple constructor or a complex definition
export type ColumnSchema = ColumnConstructor | ColumnDefinition;

// A table is a record of column schemas
export type TableSchema = Record<string, ColumnSchema>;

// The entire database schema is a record of table schemas
export type DatabaseSchema = Record<string, TableSchema>;

/**
 * Type inference helpers
 */

// Infers the TypeScript type from a ColumnConstructor
export type InferPrimitiveType<T> = 
  T extends NumberConstructor ? number :
  T extends StringConstructor ? string :
  T extends BooleanConstructor ? boolean :
  T extends DateConstructor ? Date :
  never;

// Infers the TypeScript type from a ColumnDefinition
export type InferColumnDefinitionType<T> = T extends ColumnDefinition
  ? (T['nullable'] extends true 
      ? InferPrimitiveType<T['type']> | null 
      : InferPrimitiveType<T['type']>)
  : never;

// Infers the TypeScript type from a ColumnSchema (handling both simple and complex)
export type InferColumnType<T> = 
  T extends ColumnConstructor ? InferPrimitiveType<T> :
  T extends ColumnDefinition ? InferColumnDefinitionType<T> :
  never;

// Infers the row type for a specific table
export type InferTableType<T extends TableSchema> = {
  [K in keyof T]: InferColumnType<T[K]>;
};

// Infers the full database interface
export type InferDatabaseType<T extends DatabaseSchema> = {
  [K in keyof T]: InferTableType<T[K]>;
};
