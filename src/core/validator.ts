
/**
 * PawQL Parameter Validator.
 *
 * Validates input data at runtime against the schema definition.
 * Provides clear, human-readable error messages when values don't match
 * the expected types from the schema.
 *
 * @module validator
 */

import {
  ColumnSchema,
  ColumnDefinition,
  ColumnConstructor,
  ColumnTypeValue,
  TableSchema,
  JsonType,
  UuidType,
  EnumType,
  ArrayType,
} from "../types/schema.js";

/**
 * Represents a single validation error for a specific column.
 */
export interface ValidationError {
  /** Column name that failed validation. */
  column: string;
  /** Human-readable error message. */
  message: string;
  /** The value that was provided. */
  value: unknown;
  /** The expected type name. */
  expectedType: string;
}

/**
 * Result of a validation operation.
 */
export interface ValidationResult {
  /** Whether the validation passed. */
  valid: boolean;
  /** List of validation errors (empty if valid). */
  errors: ValidationError[];
}

/**
 * Options for controlling validation behavior.
 */
export interface ValidateOptions {
  /**
   * If true, allows partial data (missing columns are not an error).
   * This is useful for UPDATE operations where you only provide changed columns.
   * @default false
   */
  partial?: boolean;

  /**
   * If true, skips columns that have a default value defined in the schema.
   * @default true
   */
  skipDefaults?: boolean;

  /**
   * If true, skips columns that are marked as primaryKey.
   * Useful for inserts where PK is auto-generated.
   * @default false
   */
  skipPrimaryKey?: boolean;
}

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Get the human-readable type name for a schema column type.
 *
 * @param type - The column type value from the schema
 * @returns A human-readable string describing the expected type
 */
function getTypeName(type: ColumnTypeValue): string {
  if (type === Number) return "number";
  if (type === String) return "string";
  if (type === Boolean) return "boolean";
  if (type === Date) return "Date";
  if (type instanceof JsonType) return "object (JSON)";
  if (type instanceof UuidType) return "string (UUID)";
  if (type instanceof EnumType) return `enum(${type.values.join(" | ")})`;
  if (type instanceof ArrayType) {
    const itemName = getTypeName(type.itemType as ColumnTypeValue);
    return `${itemName}[]`;
  }
  return "unknown";
}

/**
 * Extract the column type, nullable flag, primaryKey flag, and default value
 * from a raw ColumnSchema definition.
 *
 * @internal
 */
function parseColumnSchema(schema: ColumnSchema): {
  type: ColumnTypeValue;
  nullable: boolean;
  primaryKey: boolean;
  hasDefault: boolean;
} {
  // Simple constructor (Number, String, Boolean, Date)
  if (typeof schema === "function") {
    return { type: schema as ColumnConstructor, nullable: false, primaryKey: false, hasDefault: false };
  }

  // Advanced marker instances (JsonType, UuidType, EnumType, ArrayType)
  if (
    schema instanceof JsonType ||
    schema instanceof UuidType ||
    schema instanceof EnumType ||
    schema instanceof ArrayType
  ) {
    return { type: schema, nullable: false, primaryKey: false, hasDefault: false };
  }

  // Complex ColumnDefinition object
  const def = schema as ColumnDefinition;
  return {
    type: def.type,
    nullable: !!def.nullable,
    primaryKey: !!def.primaryKey,
    hasDefault: def.default !== undefined,
  };
}

/**
 * Validate a single value against a column type.
 *
 * @param value - The value to validate
 * @param type - The expected column type
 * @param column - The column name (for error reporting)
 * @returns A list of validation errors (empty if valid)
 *
 * @internal
 */
function validateValue(value: unknown, type: ColumnTypeValue, column: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const expectedType = getTypeName(type);

  if (type === Number) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      errors.push({ column, message: `Expected a number, got ${typeof value}`, value, expectedType });
    }
  } else if (type === String) {
    if (typeof value !== "string") {
      errors.push({ column, message: `Expected a string, got ${typeof value}`, value, expectedType });
    }
  } else if (type === Boolean) {
    if (typeof value !== "boolean") {
      errors.push({ column, message: `Expected a boolean, got ${typeof value}`, value, expectedType });
    }
  } else if (type === Date) {
    if (!(value instanceof Date) && typeof value !== "string") {
      errors.push({ column, message: `Expected a Date or date string, got ${typeof value}`, value, expectedType });
    }
    // If it's a string, check it can be parsed as a date
    if (typeof value === "string" && isNaN(new Date(value).getTime())) {
      errors.push({ column, message: `Invalid date string: "${value}"`, value, expectedType });
    }
  } else if (type instanceof JsonType) {
    if (typeof value !== "object" || value === null) {
      errors.push({ column, message: `Expected an object (JSON), got ${value === null ? "null" : typeof value}`, value, expectedType });
    }
  } else if (type instanceof UuidType) {
    if (typeof value !== "string") {
      errors.push({ column, message: `Expected a string (UUID), got ${typeof value}`, value, expectedType });
    } else if (!UUID_REGEX.test(value)) {
      errors.push({ column, message: `Invalid UUID format: "${value}"`, value, expectedType });
    }
  } else if (type instanceof EnumType) {
    if (typeof value !== "string") {
      errors.push({ column, message: `Expected a string (enum), got ${typeof value}`, value, expectedType });
    } else if (!type.values.includes(value as any)) {
      errors.push({
        column,
        message: `Value "${value}" is not a valid enum value. Allowed: ${type.values.join(", ")}`,
        value,
        expectedType,
      });
    }
  } else if (type instanceof ArrayType) {
    if (!Array.isArray(value)) {
      errors.push({ column, message: `Expected an array, got ${typeof value}`, value, expectedType });
    } else {
      // Validate each element in the array against the item type
      for (let i = 0; i < value.length; i++) {
        const itemErrors = validateValue(value[i], type.itemType as ColumnTypeValue, `${column}[${i}]`);
        errors.push(...itemErrors);
      }
    }
  }

  return errors;
}

/**
 * Validate a single row of data against a table schema.
 *
 * Checks that each provided value matches the expected type from the schema definition.
 * Also detects unknown columns that don't exist in the schema.
 *
 * @param data - The row data object to validate
 * @param tableSchema - The table schema definition
 * @param options - Validation options
 * @returns A `ValidationResult` with `valid` flag and `errors` array
 *
 * @example
 * ```typescript
 * import { validateRow } from 'pawql';
 *
 * const schema = {
 *   id: { type: Number, primaryKey: true },
 *   name: String,
 *   email: { type: String, nullable: true },
 * };
 *
 * const result = validateRow({ id: 1, name: 'Alice' }, schema);
 * console.log(result.valid); // true
 *
 * const bad = validateRow({ id: 'not-a-number', name: 123 }, schema);
 * console.log(bad.errors);
 * // [
 * //   { column: 'id', message: 'Expected a number, got string', ... },
 * //   { column: 'name', message: 'Expected a string, got number', ... },
 * // ]
 * ```
 */
export function validateRow(
  data: Record<string, unknown>,
  tableSchema: TableSchema,
  options: ValidateOptions = {}
): ValidationResult {
  const { partial = false, skipDefaults = true, skipPrimaryKey = false } = options;
  const errors: ValidationError[] = [];

  // 1. Check for unknown columns
  for (const key of Object.keys(data)) {
    if (!(key in tableSchema)) {
      errors.push({
        column: key,
        message: `Unknown column "${key}" — not defined in schema`,
        value: data[key],
        expectedType: "N/A",
      });
    }
  }

  // 2. Check each schema column
  for (const [colName, colSchema] of Object.entries(tableSchema)) {
    const parsed = parseColumnSchema(colSchema);
    const value = data[colName];

    // Skip primaryKey columns if option is set
    if (skipPrimaryKey && parsed.primaryKey) continue;

    // Check for missing required columns
    if (value === undefined) {
      if (partial) continue; // Partial mode: don't require all columns
      if (skipDefaults && parsed.hasDefault) continue; // Has default: skip
      if (parsed.nullable) continue; // Nullable: missing is OK (will be NULL)
      if (parsed.primaryKey) continue; // PK: often auto-generated

      errors.push({
        column: colName,
        message: `Missing required column "${colName}"`,
        value: undefined,
        expectedType: getTypeName(parsed.type),
      });
      continue;
    }

    // Null check
    if (value === null) {
      if (!parsed.nullable) {
        errors.push({
          column: colName,
          message: `Column "${colName}" is not nullable, but received null`,
          value: null,
          expectedType: getTypeName(parsed.type),
        });
      }
      continue;
    }

    // Type validation
    const valueErrors = validateValue(value, parsed.type, colName);
    errors.push(...valueErrors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate one or more rows against a table schema.
 * Throws a `PawQLValidationError` if any row fails validation.
 *
 * @param data - A single row or array of rows to validate
 * @param tableSchema - The table schema definition
 * @param tableName - The table name (for error messages)
 * @param options - Validation options
 * @throws {PawQLValidationError} If any validation errors are found
 *
 * @example
 * ```typescript
 * import { assertValid } from 'pawql';
 *
 * // This will throw if data is invalid
 * assertValid(
 *   { id: 1, name: 'Alice' },
 *   schema.users,
 *   'users'
 * );
 * ```
 */
export function assertValid(
  data: Record<string, unknown> | Record<string, unknown>[],
  tableSchema: TableSchema,
  tableName: string,
  options: ValidateOptions = {}
): void {
  const rows = Array.isArray(data) ? data : [data];
  const allErrors: { row: number; errors: ValidationError[] }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const result = validateRow(rows[i]!, tableSchema, options);
    if (!result.valid) {
      allErrors.push({ row: i, errors: result.errors });
    }
  }

  if (allErrors.length > 0) {
    throw new PawQLValidationError(tableName, allErrors);
  }
}

/**
 * Custom error class for PawQL validation failures.
 * Provides structured access to all validation errors across multiple rows.
 *
 * @example
 * ```typescript
 * try {
 *   assertValid(data, schema.users, 'users');
 * } catch (e) {
 *   if (e instanceof PawQLValidationError) {
 *     console.log(e.table);    // 'users'
 *     console.log(e.details);  // [{ row: 0, errors: [...] }]
 *   }
 * }
 * ```
 */
export class PawQLValidationError extends Error {
  /** The table name that failed validation. */
  readonly table: string;

  /** Detailed error information per row. */
  readonly details: { row: number; errors: ValidationError[] }[];

  constructor(table: string, details: { row: number; errors: ValidationError[] }[]) {
    const summary = details
      .map(d => {
        const rowLabel = details.length === 1 ? "" : `Row ${d.row}: `;
        return d.errors.map(e => `  ${rowLabel}${e.column}: ${e.message}`).join("\n");
      })
      .join("\n");

    super(`Validation failed for table "${table}":\n${summary}`);
    this.name = "PawQLValidationError";
    this.table = table;
    this.details = details;
  }
}
