
/**
 * Types and interfaces for the PawQL migration system.
 */

/**
 * A migration object for PawQL's pure runtime migration system.
 * No files, no CLI — just plain objects in your codebase.
 * The `name` field is the unique key stored in the tracking table.
 */
export interface Migration {
  /**
   * Unique name for this migration (e.g. '20260224_create_users' or 'create_users').
   * Stored in the `pawql_migrations` table to track execution.
   */
  name: string;

  /**
   * Apply the migration (e.g. CREATE TABLE, ALTER TABLE, etc.)
   */
  up(runner: MigrationRunner): Promise<void>;

  /**
   * Revert the migration.
   */
  down(runner: MigrationRunner): Promise<void>;
}

/**
 * The runner provides helpers for writing migration steps.
 * It wraps `db.adapter.query()` and provides schema-building utilities.
 */
export interface MigrationRunner {
  /**
   * Execute a raw SQL statement.
   * This is the escape hatch — the user writes SQL directly.
   */
  sql(query: string, params?: any[]): Promise<void>;

  /**
   * Create a table using a schema definition object.
   * Uses PawQL's runtime schema types, so no code generation is required.
   */
  createTable(tableName: string, columns: Record<string, any>): Promise<void>;

  /**
   * Drop a table.
   */
  dropTable(tableName: string): Promise<void>;

  /**
   * Add a column to an existing table.
   */
  addColumn(tableName: string, columnName: string, definition: any): Promise<void>;

  /**
   * Drop a column from a table.
   */
  dropColumn(tableName: string, columnName: string): Promise<void>;

  /**
   * Rename a table.
   */
  renameTable(oldName: string, newName: string): Promise<void>;

  /**
   * Rename a column.
   */
  renameColumn(tableName: string, oldName: string, newName: string): Promise<void>;
}

/**
 * Metadata stored in the migrations tracking table.
 */
export interface MigrationRecord {
  id: number;
  name: string;
  batch: number;
  executed_at: Date;
}

/**
 * Config options for the migration system.
 * Pure runtime — migrations are provided as in-memory objects, not files.
 */
export interface MigrationConfig {
  /**
   * Array of migration objects in execution order.
   * Order of the array is the source of truth for pending resolution.
   * Each migration must have a unique `name`.
   */
  migrations: Migration[];

  /**
   * Name of the tracking table in the database.
   * @default "pawql_migrations"
   */
  tableName?: string;
}
