
/**
 * Types and interfaces for defining database schemas at runtime.
 */

// =============================================
// Marker Classes for Advanced Types
// These act as runtime "constructors" similar to Number/String/Boolean/Date
// =============================================

/**
 * Marker for JSON/JSONB columns.
 * Usage: `metadata: json<{ tags: string[] }>()`
 */
export class JsonType<T = any> {
  readonly _brand = "json" as const;
  /** @internal */ _phantom!: T;
}

/**
 * Marker for UUID columns.
 * Usage: `id: uuid`
 */
export class UuidType {
  readonly _brand = "uuid" as const;
}

/**
 * Marker for Enum columns.
 * Usage: `role: enumType('admin', 'user', 'guest')`
 */
export class EnumType<T extends string = string> {
  readonly _brand = "enum" as const;
  readonly values: readonly T[];
  constructor(...values: T[]) {
    this.values = values;
  }
}

/**
 * Marker for Array columns.
 * Usage: `tags: arrayType(String)` → TEXT[]
 */
export class ArrayType<T = any> {
  readonly _brand = "array" as const;
  readonly itemType: ColumnConstructor;
  /** @internal */ _phantom!: T;
  constructor(itemType: ColumnConstructor) {
    this.itemType = itemType;
  }
}

// =============================================
// Factory Helpers (Runtime)
// =============================================

/** Create a JSON column type. */
export function json<T = any>(): JsonType<T> {
  return new JsonType<T>();
}

/** UUID column type (singleton). */
export const uuid = new UuidType();

/** Create an Enum column type with allowed values. */
export function enumType<T extends string>(...values: T[]): EnumType<T> {
  return new EnumType(...values);
}

/** Create an Array column type. */
export function arrayType<C extends ColumnConstructor>(itemType: C): ArrayType<InferPrimitiveType<C>[]> {
  return new ArrayType<InferPrimitiveType<C>[]>(itemType);
}

// =============================================
// String Extensions & Number Extensions
// =============================================

/** Marker for Varchar columns */
export class VarcharType {
  readonly _brand = "varchar" as const;
  readonly length: number;
  constructor(length: number) { this.length = length; }
}

/** Marker for Text columns */
export class TextType {
  readonly _brand = "text" as const;
}

/** Marker for BigInt columns */
export class BigIntType {
  readonly _brand = "bigint" as const;
}

/** Marker for Decimal columns */
export class DecimalType {
  readonly _brand = "decimal" as const;
  readonly precision: number;
  readonly scale: number;
  constructor(precision: number, scale: number) {
    this.precision = precision;
    this.scale = scale;
  }
}

export function varchar(length: number = 255): VarcharType { return new VarcharType(length); }
export function text(): TextType { return new TextType(); }
export function bigint(): BigIntType { return new BigIntType(); }
export function decimal(precision: number = 10, scale: number = 2): DecimalType { return new DecimalType(precision, scale); }


// =============================================
// Column Constructor Types
// =============================================

// Basic primitive constructors used as column definitions
export type ColumnConstructor = 
  | NumberConstructor
  | StringConstructor
  | BooleanConstructor
  | DateConstructor;

// All types that can be used as a column type (primitives + advanced)
export type ColumnTypeValue = 
  | ColumnConstructor
  | JsonType
  | UuidType
  | EnumType
  | ArrayType
  | VarcharType
  | TextType
  | BigIntType
  | DecimalType;

// Extended column definition for more complex types (nullable, default, etc.)
export interface ColumnDefinition<T = any> {
  name?: string; // Optional overridden column name
  type: ColumnTypeValue;
  nullable?: boolean;
  primaryKey?: boolean;
  default?: T;
}

// A column can be a simple constructor, a marker instance, or a complex definition
export type ColumnSchema = ColumnConstructor | JsonType | UuidType | EnumType | ArrayType | VarcharType | TextType | BigIntType | DecimalType | ColumnDefinition;

// A table is a record of column schemas
export type TableSchema = Record<string, ColumnSchema>;

// The entire database schema is a record of table schemas
export type DatabaseSchema = Record<string, TableSchema>;

// =============================================
// Type Inference Helpers
// =============================================

// Infers the TypeScript type from a ColumnConstructor
export type InferPrimitiveType<T> = 
  T extends NumberConstructor ? number :
  T extends StringConstructor ? string :
  T extends BooleanConstructor ? boolean :
  T extends DateConstructor ? Date :
  never;

// Infers the TypeScript type from advanced marker types
export type InferAdvancedType<T> =
  T extends JsonType<infer U> ? U :
  T extends UuidType ? string :
  T extends EnumType<infer U> ? U :
  T extends ArrayType<infer U> ? U :
  T extends VarcharType ? string :
  T extends TextType ? string :
  T extends BigIntType ? number | string :
  T extends DecimalType ? number | string :
  never;

// Infers the TypeScript type from a ColumnDefinition
export type InferColumnDefinitionType<T> = T extends ColumnDefinition<any>
  ? T['type'] extends ColumnConstructor
    ? (T['nullable'] extends true 
        ? InferPrimitiveType<T['type']> | null 
        : InferPrimitiveType<T['type']>)
    : (T['nullable'] extends true 
        ? InferAdvancedType<T['type']> | null 
        : InferAdvancedType<T['type']>)
  : never;

// Infers the TypeScript type from a ColumnSchema (handling all variants)
export type InferColumnType<T> = 
  T extends ColumnConstructor ? InferPrimitiveType<T> :
  T extends JsonType ? InferAdvancedType<T> :
  T extends UuidType ? string :
  T extends EnumType ? InferAdvancedType<T> :
  T extends ArrayType ? InferAdvancedType<T> :
  T extends VarcharType ? string :
  T extends TextType ? string :
  T extends BigIntType ? number | string :
  T extends DecimalType ? number | string :
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
