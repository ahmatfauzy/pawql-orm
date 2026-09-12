# Migrations

PawQL includes a built-in migration system that is **pure runtime** — no CLI, no file generation, no build step. You define migrations as plain objects in your codebase and execute them via `Migrator`.

## Overview

Migrations are defined as an array of `Migration` objects, each with a unique `name`, an `up()` and a `down()` function. The `Migrator` compares this array against the tracking table in the database to determine which migrations are pending.

This gives you absolute control over when and how migrations execute (e.g. in `server.ts` startup) — no external tool required.

## Setup & Programmatic Usage

### 1. Define Migrations Inline

```typescript
import type { Migration } from 'pawql';

export const migrations: Migration[] = [
  {
    name: '20260224_create_users',
    async up(runner) {
      await runner.createTable('users', {
        id: { type: Number, primaryKey: true },
        name: String,
        email: { type: String, nullable: true },
        isActive: { type: Boolean, default: true },
      });
    },
    async down(runner) {
      await runner.dropTable('users');
    },
  },
  {
    name: '20260225_create_posts',
    async up(runner) {
      await runner.createTable('posts', {
        id: { type: Number, primaryKey: true },
        userId: Number,
        title: String,
        body: { type: String, nullable: true },
      });
    },
    async down(runner) {
      await runner.dropTable('posts');
    },
  },
];
```

> `name` must be unique. Convention is `YYYYMMDD_description` but any unique string works. Order of the array is the execution order.

### 2. Initialize the Migrator

```typescript
import { connect, Migrator } from 'pawql';
import { migrations } from './migrations.js';

const db = await connect({}, process.env.DATABASE_URL!);
// Migrator needs the underlying adapter — access via (db as any)._adapter or create adapter separately
const migrator = new Migrator((db as any)._adapter ?? adapter, {
  migrations,
  tableName: 'pawql_migrations', // optional, default
});
```

Alternatively, if you create the adapter directly:

```typescript
import { PostgresAdapter, Migrator } from 'pawql';

const adapter = new PostgresAdapter({ connectionString: process.env.DATABASE_URL! });
const migrator = new Migrator(adapter, { migrations });
```

### 3. Execute Pending Migrations

When your server starts, apply them programmatically:

```typescript
const applied = await migrator.up();
console.log('Applied migrations:', applied);
// -> ['20260224_create_users', '20260225_create_posts']
```

### 4. Rollback Last Batch

```typescript
const rolledBack = await migrator.down();
console.log('Rolled back last batch:', rolledBack);
```

## MigrationRunner API

The `MigrationRunner` object is passed to every migration's `up()` and `down()` functions. It provides helpers for common DDL operations.

### `runner.createTable(tableName, columns)`

Create a new table. The `columns` argument uses PawQL's runtime schema types — the same object syntax used in `createDB()`.

```typescript
await runner.createTable('posts', {
  id: { type: Number, primaryKey: true },
  userId: Number,
  title: String,
  body: { type: String, nullable: true },
  createdAt: Date,
});
```

Supported column types:
- `Number` → `INTEGER`
- `String` → `TEXT`
- `Boolean` → `BOOLEAN`
- `Date` → `TIMESTAMP`
- `json<T>()` → `JSONB`
- `uuid` → `UUID`
- `enumType('a', 'b')` → `TEXT` with `CHECK` constraint
- `arrayType(String)` → `TEXT[]`

Column options (via object syntax):
- `primaryKey: true` → `PRIMARY KEY`
- `nullable: true` → allows `NULL` (default is `NOT NULL`)
- `default: value` → `DEFAULT value`

### `runner.dropTable(tableName)`

Drop a table (with `CASCADE`).

```typescript
await runner.dropTable('posts');
```

### `runner.addColumn(tableName, columnName, definition)`

Add a column to an existing table.

```typescript
// Simple column
await runner.addColumn('users', 'age', Number);

// With options
await runner.addColumn('users', 'bio', { type: String, nullable: true });
```

### `runner.dropColumn(tableName, columnName)`

Remove a column from a table.

```typescript
await runner.dropColumn('users', 'bio');
```

### `runner.renameTable(oldName, newName)`

Rename a table.

```typescript
await runner.renameTable('users', 'accounts');
```

### `runner.renameColumn(tableName, oldName, newName)`

Rename a column.

```typescript
await runner.renameColumn('users', 'name', 'fullName');
```

### `runner.sql(query, params?)`

Execute any raw SQL statement. This is the escape hatch for anything the helpers don't cover.

```typescript
// Create an index
await runner.sql('CREATE INDEX idx_users_email ON users(email)');

// With parameters
await runner.sql('INSERT INTO settings (key, value) VALUES ($1, $2)', ['app_name', 'MyApp']);
```

## Batch Behavior

Migrations are organized into **batches**:

- Every call to `migrator.up()` creates a new batch number.
- All migrations applied in a single `migrator.up()` call share the same batch number.
- `migrator.down()` rolls back **only the last batch** — not all migrations.

This allows you to safely rollback a group of related migrations together.

### Example

```
Batch 1: 20260224_create_users, 20260225_create_posts      (first migrator.up())
Batch 2: 20260226_add_user_avatar, 20260227_add_post_tags  (second migrator.up())
```

Running `migrator.down()` once rolls back batch 2 (`20260227_add_post_tags`, then `20260226_add_user_avatar`). Running it again rolls back batch 1.

## Tracking Table

PawQL automatically creates a `pawql_migrations` table (configurable via `tableName` in config) to track which migrations have been applied:

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PRIMARY KEY` | Auto-increment ID |
| `name` | `TEXT UNIQUE` | Migration `name` |
| `batch` | `INTEGER` | Batch number |
| `executed_at` | `TIMESTAMP` | When the migration was applied |

## Using Advanced Types in Migrations

Since migrations use PawQL's runtime schema types, you can use all the advanced type helpers:

```typescript
import type { Migration } from 'pawql';
import { uuid, json, enumType, arrayType } from 'pawql';

export const migrations: Migration[] = [
  {
    name: '20260224_create_events',
    async up(runner) {
      await runner.createTable('events', {
        id: uuid,
        name: String,
        type: enumType('conference', 'meetup', 'workshop'),
        tags: arrayType(String),
        metadata: json<{ location: string; capacity: number }>(),
        createdAt: Date,
      });
    },
    async down(runner) {
      await runner.dropTable('events');
    },
  },
];
```

## Philosophy

PawQL's migration system is intentionally minimal:

- **No code generation** — You write migration objects yourself, using runtime schema types.
- **No build step** — Migrations are plain objects in your codebase.
- **No CLI** — No `npx pawql` command. Just `new Migrator(adapter, { migrations })` in your startup script.
- **No magic** — The `MigrationRunner` is a thin wrapper around SQL. You always know what's happening.
- **Same types everywhere** — The column definitions in your migrations use the exact same syntax as `createDB()`.

This keeps PawQL true to its core promise: **The Runtime-First ORM for TypeScript**.

## Tips

1. **Name your migrations descriptively**: `20260224_create_users`, `20260225_add_email_to_posts`.
2. **Keep `name` unique**: The `name` field is the primary key in the tracking table.
3. **Preserve order**: Define migrations in chronological order in the array. Pending detection preserves this order.
4. **Always write a `down()`**: Even if you think you'll never rollback, it's good practice.
5. **Use raw SQL for complex operations**: Indexes, constraints, triggers — use `runner.sql()`.
6. **Keep old migrations in the array**: Never remove a previously applied migration from the array, or `down()` will fail to find it. If you must clean up, ensure the tracking table is pruned.
