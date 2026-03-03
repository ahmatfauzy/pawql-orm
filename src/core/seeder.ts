
/**
 * PawQL Seeder.
 *
 * Provides a clean, declarative way to populate your database
 * with initial or test data, using the same schema-driven approach
 * as the rest of PawQL.
 *
 * @module seeder
 */

import { Database } from "./database.js";
import { DatabaseSchema, TableSchema } from "../types/schema.js";
import { assertValid, ValidateOptions } from "./validator.js";

/**
 * A seed definition for a single table.
 * Maps table names to their seed row data.
 */
export type SeedData<TSchema extends DatabaseSchema> = {
  [K in keyof TSchema]?: Record<string, unknown>[];
};

/**
 * Options for configuring seeder behavior.
 */
export interface SeederOptions {
  /**
   * If true, truncate each table before seeding (DELETE all existing rows).
   * @default false
   */
  truncate?: boolean;

  /**
   * If true, validate each row against the schema before inserting.
   * @default true
   */
  validate?: boolean;

  /**
   * Validation options passed to the validator.
   * Only used when `validate` is true.
   */
  validateOptions?: ValidateOptions;

  /**
   * If true, run all seed operations in a single transaction.
   * If any seed fails, all changes are rolled back.
   * @default true
   */
  transaction?: boolean;

  /**
   * Optional callback invoked after each table is seeded.
   * Useful for logging or progress tracking.
   */
  onSeed?: (tableName: string, rowCount: number) => void;
}

/**
 * Result of a seed operation.
 */
export interface SeedResult {
  /** Total number of rows inserted across all tables. */
  totalRows: number;
  /** Per-table breakdown of inserted row counts. */
  tables: { name: string; rows: number }[];
}

/**
 * Seed a database with initial data.
 *
 * Inserts rows into specified tables in the order they appear in the `data` object.
 * Optionally validates data against the schema before inserting and wraps
 * everything in a transaction for atomicity.
 *
 * @typeParam TSchema - The database schema type
 * @param db - The PawQL database instance
 * @param data - The seed data keyed by table name
 * @param options - Optional seeder configuration
 * @returns A `SeedResult` with the total and per-table row counts
 *
 * @example
 * ```typescript
 * import { createDB, PostgresAdapter, seed } from 'pawql';
 *
 * const db = createDB(schema, adapter);
 *
 * await seed(db, {
 *   users: [
 *     { id: 1, name: 'Alice', email: 'alice@example.com', age: 28 },
 *     { id: 2, name: 'Bob', email: 'bob@example.com', age: 32 },
 *   ],
 *   posts: [
 *     { id: 1, userId: 1, title: 'Hello World', content: '...' },
 *   ],
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With options
 * await seed(db, data, {
 *   truncate: true,    // Clear tables first
 *   validate: true,    // Validate against schema
 *   transaction: true, // Atomic operation
 *   onSeed: (table, count) => console.log(`Seeded ${count} rows into ${table}`),
 * });
 * ```
 */
export async function seed<TSchema extends DatabaseSchema>(
  db: Database<TSchema>,
  data: SeedData<TSchema>,
  options: SeederOptions = {}
): Promise<SeedResult> {
  const {
    truncate = false,
    validate = true,
    validateOptions = { skipPrimaryKey: false, skipDefaults: true },
    transaction: useTransaction = true,
    onSeed,
  } = options;

  const schema = db.schema;
  const tableEntries = Object.entries(data) as [string, Record<string, unknown>[]][];
  const result: SeedResult = { totalRows: 0, tables: [] };

  // Validate table names exist in schema
  for (const [tableName] of tableEntries) {
    if (!(tableName in schema)) {
      throw new Error(`Seed error: Table "${tableName}" does not exist in the schema.`);
    }
  }

  // Validate all data before inserting
  if (validate) {
    for (const [tableName, rows] of tableEntries) {
      if (!rows || rows.length === 0) continue;
      const tableSchema = (schema as Record<string, TableSchema>)[tableName]!;
      assertValid(rows, tableSchema, tableName, validateOptions);
    }
  }

  // The actual seeding logic
  const doSeed = async (dbInstance: Database<TSchema>) => {
    for (const [tableName, rows] of tableEntries) {
      if (!rows || rows.length === 0) continue;

      // Truncate if requested
      if (truncate) {
        await dbInstance.raw(`DELETE FROM "${tableName}"`);
      }

      // Insert rows using the query builder
      await (dbInstance.query(tableName as keyof TSchema & string) as any)
        .insert(rows)
        .returning(false)
        .execute();

      result.tables.push({ name: tableName, rows: rows.length });
      result.totalRows += rows.length;

      if (onSeed) {
        onSeed(tableName, rows.length);
      }
    }
  };

  // Execute with or without transaction
  if (useTransaction) {
    await db.transaction(async (tx) => {
      await doSeed(tx as Database<TSchema>);
    });
  } else {
    await doSeed(db);
  }

  return result;
}

/**
 * Create a reusable seeder function for a specific database instance.
 *
 * Returns a function that can be called multiple times with different data
 * and options. Useful for test fixtures or scripted seeding.
 *
 * @typeParam TSchema - The database schema type
 * @param db - The PawQL database instance
 * @param defaultOptions - Default options applied to every call (can be overridden per call)
 * @returns A seeder function
 *
 * @example
 * ```typescript
 * const seeder = createSeeder(db, { validate: true, transaction: true });
 *
 * // Seed users
 * await seeder({
 *   users: [
 *     { id: 1, name: 'Alice', email: 'alice@example.com', age: 28 },
 *   ],
 * });
 *
 * // Seed more data later
 * await seeder({
 *   posts: [
 *     { id: 1, userId: 1, title: 'Hello', content: '...' },
 *   ],
 * });
 * ```
 */
export function createSeeder<TSchema extends DatabaseSchema>(
  db: Database<TSchema>,
  defaultOptions: SeederOptions = {}
): (data: SeedData<TSchema>, options?: SeederOptions) => Promise<SeedResult> {
  return (data: SeedData<TSchema>, options: SeederOptions = {}) => {
    return seed(db, data, { ...defaultOptions, ...options });
  };
}
