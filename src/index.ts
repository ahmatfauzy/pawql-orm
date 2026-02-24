
// Core
export * from "./core/database.js";
export * from "./core/adapter.js";
export * from "./adapters/pg.js";

// Query Builder
export * from "./query/builder.js";

// Schema Helpers (Primitives)
export const number = Number;
export const string = String;
export const boolean = Boolean;
export const date = Date;

// Schema Helpers (Advanced Types)
export { json, uuid, enumType, arrayType } from "./types/schema.js";

// Types
export * from "./types/schema.js";

// Migration
export { Migrator, createMigrationRunner } from "./migration/index.js";
export type { Migration, MigrationRunner, MigrationConfig, MigrationRecord } from "./migration/types.js";

