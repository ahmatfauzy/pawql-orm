
import { DatabaseAdapter } from "../core/adapter.js";
import { MigrationConfig, MigrationRecord, Migration } from "./types.js";
import { createMigrationRunner } from "./runner.js";
import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_TABLE = "pawql_migrations";
const DEFAULT_DIRECTORY = "./migrations";

/**
 * The Migrator class manages migration state and execution.
 * It uses the database adapter directly — no code generation required.
 */
export class Migrator {
  private _adapter: DatabaseAdapter;
  private _tableName: string;
  private _directory: string;

  constructor(adapter: DatabaseAdapter, config?: MigrationConfig) {
    this._adapter = adapter;
    this._tableName = config?.tableName ?? DEFAULT_TABLE;
    this._directory = config?.directory ?? DEFAULT_DIRECTORY;
  }

  /**
   * Ensure the migrations tracking table exists.
   */
  async ensureTable(): Promise<void> {
    await this._adapter.query(`
      CREATE TABLE IF NOT EXISTS "${this._tableName}" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL UNIQUE,
        "batch" INTEGER NOT NULL,
        "executed_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }

  /**
   * Get all executed migration records, ordered by name.
   */
  async getExecuted(): Promise<MigrationRecord[]> {
    const result = await this._adapter.query<MigrationRecord>(
      `SELECT * FROM "${this._tableName}" ORDER BY "name" ASC`
    );
    return result.rows;
  }

  /**
   * Get the current batch number.
   */
  async getCurrentBatch(): Promise<number> {
    const result = await this._adapter.query<{ max: number | null }>(
      `SELECT COALESCE(MAX("batch"), 0) AS "max" FROM "${this._tableName}"`
    );
    return Number(result.rows[0]?.max ?? 0);
  }

  /**
   * List all migration files from the migration directory.
   * Files must end in `.ts`, `.mts`, `.js`, or `.mjs`.
   * Returns sorted filenames (without extension).
   */
  listMigrationFiles(): string[] {
    const dir = path.resolve(this._directory);
    if (!fs.existsSync(dir)) return [];

    return fs
      .readdirSync(dir)
      .filter((f) => /\.(ts|mts|js|mjs)$/.test(f))
      .filter((f) => !f.endsWith(".d.ts"))
      .sort()
      .map((f) => f.replace(/\.(ts|mts|js|mjs)$/, ""));
  }

  /**
   * Get pending migration names (files that haven't been executed yet).
   */
  async getPending(): Promise<string[]> {
    await this.ensureTable();
    const executed = await this.getExecuted();
    const executedNames = new Set(executed.map((r) => r.name));
    const allFiles = this.listMigrationFiles();
    return allFiles.filter((name) => !executedNames.has(name));
  }

  /**
   * Dynamically import a migration file and return the Migration object.
   */
  async loadMigration(name: string): Promise<Migration> {
    const dir = path.resolve(this._directory);
    const extensions = [".ts", ".mts", ".js", ".mjs"];

    let filePath: string | null = null;
    for (const ext of extensions) {
      const candidate = path.join(dir, name + ext);
      if (fs.existsSync(candidate)) {
        filePath = candidate;
        break;
      }
    }

    if (!filePath) {
      throw new Error(`Migration file not found: ${name}`);
    }

    // Use dynamic import — works in ESM with both Node.js and Bun
    const mod = await import(filePath);
    const migration: Migration = mod.default ?? mod;

    if (typeof migration.up !== "function" || typeof migration.down !== "function") {
      throw new Error(
        `Migration "${name}" must export "up" and "down" functions.`
      );
    }

    return migration;
  }

  /**
   * Run all pending migrations (migrate:up).
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
      const migration = await this.loadMigration(name);
      await migration.up(runner);

      // Record the migration
      await this._adapter.query(
        `INSERT INTO "${this._tableName}" ("name", "batch") VALUES ($1, $2)`,
        [name, batch]
      );

      applied.push(name);
    }

    return applied;
  }

  /**
   * Rollback the last batch of migrations (migrate:down).
   * Returns the list of migration names that were rolled back.
   */
  async down(): Promise<string[]> {
    await this.ensureTable();
    const currentBatch = await this.getCurrentBatch();

    if (currentBatch === 0) return [];

    // Get migrations from the last batch, in reverse order
    const result = await this._adapter.query<MigrationRecord>(
      `SELECT * FROM "${this._tableName}" WHERE "batch" = $1 ORDER BY "name" DESC`,
      [currentBatch]
    );

    const runner = createMigrationRunner(this._adapter);
    const rolledBack: string[] = [];

    for (const record of result.rows) {
      const migration = await this.loadMigration(record.name);
      await migration.down(runner);

      // Remove the record from tracking table
      await this._adapter.query(
        `DELETE FROM "${this._tableName}" WHERE "name" = $1`,
        [record.name]
      );

      rolledBack.push(record.name);
    }

    return rolledBack;
  }

  /**
   * Generate a new migration file (migrate:make).
   * Creates a timestamped `.ts` file in the migrations directory.
   * This is a scaffold — the user fills in the `up()` and `down()` logic.
   */
  make(name: string): string {
    const dir = path.resolve(this._directory);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 14);
    const fileName = `${timestamp}_${name}.ts`;
    const filePath = path.join(dir, fileName);

    const template = `import type { MigrationRunner } from 'pawql';

export default {
  async up(runner: MigrationRunner) {
    // Example: Create a table using PawQL runtime schema types
    // await runner.createTable('users', {
    //   id: { type: Number, primaryKey: true },
    //   name: String,
    //   email: { type: String, nullable: true },
    // });

    // Or use raw SQL:
    // await runner.sql('CREATE INDEX idx_users_email ON users(email)');
  },

  async down(runner: MigrationRunner) {
    // Revert the migration
    // await runner.dropTable('users');
  },
};
`;

    fs.writeFileSync(filePath, template, "utf-8");
    return filePath;
  }
}
