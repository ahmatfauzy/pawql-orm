
// Core
export * from "./core/database.js";
export * from "./core/adapter.js";
export * from "./core/logger.js";
export * from "./adapters/pg.js";

// Query Builder
export * from "./query/builder.js";

// Schema Helpers (Primitives)
/** Alias for `Number` constructor — use as column type for INTEGER columns. */
export const number = Number;
/** Alias for `String` constructor — use as column type for TEXT columns. */
export const string = String;
/** Alias for `Boolean` constructor — use as column type for BOOLEAN columns. */
export const boolean = Boolean;
/** Alias for `Date` constructor — use as column type for TIMESTAMP columns. */
export const date = Date;

// Schema Helpers (Advanced Types)
export { json, uuid, enumType, arrayType } from "./types/schema.js";

// Types
export * from "./types/schema.js";

// Migration
export { Migrator, createMigrationRunner } from "./migration/index.js";
export type { Migration, MigrationRunner, MigrationConfig, MigrationRecord } from "./migration/types.js";
