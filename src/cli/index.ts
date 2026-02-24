#!/usr/bin/env node

/**
 * PawQL CLI — Migration commands
 * 
 * Usage:
 *   pawql migrate:make <name>   — Create a new migration file
 *   pawql migrate:up            — Run all pending migrations
 *   pawql migrate:down          — Rollback the last batch of migrations
 *
 * Config:
 *   The CLI looks for a `pawql.config.ts` or `pawql.config.js` file
 *   in the current working directory. The config file must export
 *   an adapter instance and optionally migration settings.
 *
 * Example pawql.config.ts:
 *   import { PostgresAdapter } from 'pawql';
 *   export default {
 *     adapter: new PostgresAdapter({ connectionString: process.env.DATABASE_URL }),
 *     migrations: {
 *       directory: './migrations',
 *       tableName: 'pawql_migrations',
 *     },
 *   };
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { Migrator } from "../migration/migrator.js";
import type { DatabaseAdapter } from "../core/adapter.js";
import type { MigrationConfig } from "../migration/types.js";

interface PawQLConfig {
  adapter: DatabaseAdapter;
  migrations?: MigrationConfig;
}

const HELP = `
  PawQL CLI — Migration commands

  Usage:
    pawql migrate:make <name>   Create a new migration file
    pawql migrate:up            Run all pending migrations
    pawql migrate:down          Rollback the last batch

  Config:
    Create a pawql.config.ts (or .js/.mjs) in your project root.
    See docs/migrations.md for details.
`;

async function loadConfig(): Promise<PawQLConfig> {
  const cwd = process.cwd();
  const candidates = [
    "pawql.config.ts",
    "pawql.config.mts",
    "pawql.config.js",
    "pawql.config.mjs",
  ];

  for (const name of candidates) {
    const fullPath = path.join(cwd, name);
    if (fs.existsSync(fullPath)) {
      const mod = await import(fullPath);
      const config: PawQLConfig = mod.default ?? mod;

      if (!config.adapter) {
        console.error(`Error: ${name} must export an "adapter" property.`);
        process.exit(1);
      }

      return config;
    }
  }

  console.error("Error: No pawql.config.{ts,js,mjs,mts} found in the current directory.");
  console.error("Create one to configure your database adapter. See docs/migrations.md.");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  // migrate:make doesn't need a database connection for just scaffolding
  if (command === "migrate:make") {
    const name = args[1];
    if (!name) {
      console.error("Error: Migration name is required.");
      console.error("Usage: pawql migrate:make <name>");
      process.exit(1);
    }

    // Validate name: only alphanumeric and underscores
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      console.error("Error: Migration name must contain only letters, numbers, and underscores.");
      process.exit(1);
    }

    // Try to load config for directory setting, but use defaults if no config exists
    let directory = "./migrations";
    try {
      const config = await loadConfig();
      directory = config.migrations?.directory ?? directory;
    } catch {
      // No config file — use defaults
    }

    const migrator = new Migrator(null as any, { directory });
    const filePath = migrator.make(name);
    console.log(`✅ Created migration: ${path.relative(process.cwd(), filePath)}`);
    process.exit(0);
  }

  // All other commands need a database connection
  const config = await loadConfig();
  const migrator = new Migrator(config.adapter, config.migrations);

  try {
    switch (command) {
      case "migrate:up": {
        console.log("Running pending migrations...\n");
        const applied = await migrator.up();

        if (applied.length === 0) {
          console.log("Nothing to migrate. All migrations are up to date.");
        } else {
          for (const name of applied) {
            console.log(`  ✅ ${name}`);
          }
          console.log(`\n${applied.length} migration(s) applied.`);
        }
        break;
      }

      case "migrate:down": {
        console.log("Rolling back last batch...\n");
        const rolledBack = await migrator.down();

        if (rolledBack.length === 0) {
          console.log("Nothing to rollback.");
        } else {
          for (const name of rolledBack) {
            console.log(`  ↩️  ${name}`);
          }
          console.log(`\n${rolledBack.length} migration(s) rolled back.`);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (error: any) {
    console.error(`\nMigration error: ${error.message}`);
    process.exit(1);
  } finally {
    await config.adapter.close();
  }
}

main();
