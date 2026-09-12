import { DatabaseAdapter } from "../core/adapter.js";
import { MigrationConfig, MigrationRecord, Migration } from "./types.js";
import { createMigrationRunner } from "./runner.js";

const DEFAULT_TABLE = "pawql_migrations";

/**
 * The Migrator class manages migration state and execution.
 * Pure runtime — no file system, no CLI. Migrations are provided as in-memory objects.
 * Order of `config.migrations` is the source of truth.
 */
export class Migrator {
  private _adapter: DatabaseAdapter;
  private _tableName: string;
  private _migrations: Migration[];
  private _migrationMap: Map<string, Migration>;

  constructor(adapter: DatabaseAdapter, config: MigrationConfig) {
    if (!config || !Array.isArray(config.migrations)) {
      throw new Error(
        'Migrator requires `migrations: Migration[]` array. Example: new Migrator(adapter, { migrations: [{ name: "create_users", up, down }] })'
      );
    }

    // Validate unique names
    const seen = new Set<string>();
    for (const m of config.migrations) {
      if (!m.name || typeof m.name !== "string") {
        throw new Error('Each migration must have a unique `name: string` property.');
      }
      if (seen.has(m.name)) {
        throw new Error(`Duplicate migration name: "${m.name}"`);
      }
      if (typeof m.up !== "function" || typeof m.down !== "function") {
        throw new Error(
          `Migration "${m.name}" must have "up" and "down" functions.`
        );
      }
      seen.add(m.name);
    }

    this._adapter = adapter;
    this._tableName = config.tableName ?? DEFAULT_TABLE;
    this._migrations = [...config.migrations];
    this._migrationMap = new Map(this._migrations.map((m) => [m.name, m]));
  }

  /**
   * Ensure the migrations tracking table exists.
   * Dialect-aware: generates correct auto-increment PK and timestamp default per DB.
   */
  async ensureTable(): Promise<void> {
    const dialect = (this._adapter.dialect?.toLowerCase() || "postgres") as string;
    const t = this._adapter.quote(this._tableName);
    const q = (id: string) => this._adapter.quote(id);

    let sql: string;
    if (dialect === "mysql") {
      sql = `CREATE TABLE IF NOT EXISTS ${t} (
        ${q("id")} INT AUTO_INCREMENT PRIMARY KEY,
        ${q("name")} TEXT NOT NULL,
        ${q("batch")} INT NOT NULL,
        ${q("executed_at")} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (${q("name")})
      );`;
    } else if (dialect === "sqlite") {
      sql = `CREATE TABLE IF NOT EXISTS ${t} (
        ${q("id")} INTEGER PRIMARY KEY AUTOINCREMENT,
        ${q("name")} TEXT NOT NULL UNIQUE,
        ${q("batch")} INTEGER NOT NULL,
        ${q("executed_at")} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`;
    } else {
      // postgres and fallback (DummyAdapter defaults to postgres)
      sql = `CREATE TABLE IF NOT EXISTS ${t} (
        ${q("id")} SERIAL PRIMARY KEY,
        ${q("name")} TEXT NOT NULL UNIQUE,
        ${q("batch")} INTEGER NOT NULL,
        ${q("executed_at")} TIMESTAMP NOT NULL DEFAULT NOW()
      );`;
    }

    await this._adapter.query(sql);
  }

  /**
   * Get all executed migration records, ordered by name.
   */
  async getExecuted(): Promise<MigrationRecord[]> {
    const t = this._adapter.quote(this._tableName);
    const result = await this._adapter.query<MigrationRecord>(
      `SELECT * FROM ${t} ORDER BY ${this._adapter.quote("name")} ASC`
    );
    return result.rows;
  }

  /**
   * Get the current batch number.
   */
  async getCurrentBatch(): Promise<number> {
    const t = this._adapter.quote(this._tableName);
    const col = this._adapter.quote("batch");
    const result = await this._adapter.query<{ max: number | null }>(
      `SELECT COALESCE(MAX(${col}), 0) AS "max" FROM ${t}`
    );
    return Number(result.rows[0]?.max ?? 0);
  }

  /**
   * Get pending migration names — those in `config.migrations` not yet in tracking table.
   * Preserves the order of the provided `migrations` array.
   */
  async getPending(): Promise<string[]> {
    await this.ensureTable();
    const executed = await this.getExecuted();
    const executedNames = new Set(executed.map((r) => r.name));
    return this._migrations
      .map((m) => m.name)
      .filter((name) => !executedNames.has(name));
  }

  /**
   * Run all pending migrations.
   * Returns the list of migration names that were applied.
   */
  async up(): Promise<string[]> {
    await this.ensureTable();
    const pending = await this.getPending();

    if (pending.length === 0) return [];

    const batch = (await this.getCurrentBatch()) + 1;
    const runner = createMigrationRunner(this._adapter);
    const applied: string[] = [];

    for (const name of pending) {
      const migration = this._migrationMap.get(name);
      if (!migration) {
        throw new Error(`Migration "${name}" not found in provided migrations array`);
      }
      await migration.up(runner);

      // Record the migration
      const insT = this._adapter.quote(this._tableName);
      await this._adapter.query(
        `INSERT INTO ${insT} (${this._adapter.quote("name")}, ${this._adapter.quote("batch")}) VALUES ($1, $2)`,
        [name, batch]
      );

      applied.push(name);
    }

    return applied;
  }

  /**
   * Rollback the last batch of migrations.
   * Returns the list of migration names that were rolled back.
   */
  async down(): Promise<string[]> {
    await this.ensureTable();
    const currentBatch = await this.getCurrentBatch();

    if (currentBatch === 0) return [];

    // Get migrations from the last batch, in reverse order
    const t = this._adapter.quote(this._tableName);
    const result = await this._adapter.query<MigrationRecord>(
      `SELECT * FROM ${t} WHERE ${this._adapter.quote("batch")} = $1 ORDER BY ${this._adapter.quote("name")} DESC`,
      [currentBatch]
    );

    const runner = createMigrationRunner(this._adapter);
    const rolledBack: string[] = [];

    for (const record of result.rows) {
      const migration = this._migrationMap.get(record.name);
      if (!migration) {
        throw new Error(
          `Cannot rollback "${record.name}" — not found in provided migrations array. ` +
          `Ensure all previously applied migrations are still included.`
        );
      }
      await migration.down(runner);

      // Remove the record from tracking table
      const delT = this._adapter.quote(this._tableName);
      await this._adapter.query(
        `DELETE FROM ${delT} WHERE ${this._adapter.quote("name")} = $1`,
        [record.name]
      );

      rolledBack.push(record.name);
    }

    return rolledBack;
  }
}
