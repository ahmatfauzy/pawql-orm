
/**
 * Types and interfaces for the PawQL migration system.
 */

/**
 * A migration file must export an object conforming to this interface.
 */
export interface Migration {
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
 */
export interface MigrationConfig {
  /**
   * Directory where migration files live.
   * @default "./migrations"
   */
  directory?: string;

  /**
   * Name of the tracking table in the database.
   * @default "pawql_migrations"
   */
  tableName?: string;
}
