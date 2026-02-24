# Migrations

PawQL includes a built-in migration system that stays true to its **runtime-first philosophy** — no code generation, no build step. You write migration files using the same PawQL schema types you already know, and the CLI handles the rest.

## Overview

| Command | Description |
|---------|-------------|
| `pawql migrate:make <name>` | Create a new timestamped migration file |
| `pawql migrate:up` | Run all pending migrations |
| `pawql migrate:down` | Rollback the last batch of migrations |

## Setup

### 1. Create a config file

Create a `pawql.config.ts` (or `.js`/`.mjs`) in your project root:

```typescript
// pawql.config.ts
import { PostgresAdapter } from 'pawql';

export default {
  adapter: new PostgresAdapter({
    connectionString: process.env.DATABASE_URL,
  }),

  migrations: {
    directory: './migrations',       // default: './migrations'
    tableName: 'pawql_migrations',   // default: 'pawql_migrations'
  },
};
```

The config file must export an `adapter` property — a valid PawQL `DatabaseAdapter` instance. The `migrations` object is optional; it defaults to the values shown above.

### 2. Create your first migration

```bash
npx pawql migrate:make create_users
```

This creates a timestamped file in your migrations directory:

```
migrations/
  20260224123456_create_users.ts
```

### 3. Write the migration

Open the generated file and fill in the `up()` and `down()` functions:

```typescript
import type { MigrationRunner } from 'pawql';

export default {
  async up(runner: MigrationRunner) {
    await runner.createTable('users', {
      id: { type: Number, primaryKey: true },
      name: String,
      email: { type: String, nullable: true },
      isActive: { type: Boolean, default: true },
    });
  },

  async down(runner: MigrationRunner) {
    await runner.dropTable('users');
  },
};
```

### 4. Run the migration

```bash
npx pawql migrate:up
```

Output:
```
Running pending migrations...

  ✅ 20260224123456_create_users

1 migration(s) applied.
```

### 5. Rollback if needed

```bash
npx pawql migrate:down
```

Output:
```
Rolling back last batch...

  ↩️  20260224123456_create_users

1 migration(s) rolled back.
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

- Every call to `migrate:up` creates a new batch number.
- All migrations applied in a single `migrate:up` call share the same batch number.
- `migrate:down` rolls back **only the last batch** — not all migrations.

This allows you to safely rollback a group of related migrations together.

### Example

```
Batch 1: create_users, create_posts      (applied with first migrate:up)
Batch 2: add_user_avatar, add_post_tags  (applied with second migrate:up)
```

Running `migrate:down` once rolls back batch 2 (`add_post_tags`, then `add_user_avatar`). Running it again rolls back batch 1.

## Tracking Table

PawQL automatically creates a `pawql_migrations` table (configurable via `tableName` in config) to track which migrations have been applied:

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PRIMARY KEY` | Auto-increment ID |
| `name` | `TEXT UNIQUE` | Migration filename (without extension) |
| `batch` | `INTEGER` | Batch number |
| `executed_at` | `TIMESTAMP` | When the migration was applied |

## Using Advanced Types in Migrations

Since migrations use PawQL's runtime schema types, you can use all the advanced type helpers:

```typescript
import type { MigrationRunner } from 'pawql';
import { uuid, json, enumType, arrayType } from 'pawql';

export default {
  async up(runner: MigrationRunner) {
    await runner.createTable('events', {
      id: uuid,
      name: String,
      type: enumType('conference', 'meetup', 'workshop'),
      tags: arrayType(String),
      metadata: json<{ location: string; capacity: number }>(),
      createdAt: Date,
    });
  },

  async down(runner: MigrationRunner) {
    await runner.dropTable('events');
  },
};
```

## Programmatic Usage

You can also use the `Migrator` class directly from your code (e.g., in tests or deployment scripts):

```typescript
import { Migrator, PostgresAdapter } from 'pawql';

const adapter = new PostgresAdapter({
  connectionString: process.env.DATABASE_URL,
});

const migrator = new Migrator(adapter, {
  directory: './migrations',
});

// Run pending migrations
const applied = await migrator.up();
console.log('Applied:', applied);

// Rollback last batch
const rolledBack = await migrator.down();
console.log('Rolled back:', rolledBack);

// Get pending migrations
const pending = await migrator.getPending();
console.log('Pending:', pending);

// Create a new migration file
const filePath = migrator.make('add_comments_table');
console.log('Created:', filePath);

await adapter.close();
```

## Philosophy

PawQL's migration system is intentionally minimal:

- **No code generation** — You write migration files yourself, using runtime schema types.
- **No build step** — Migration files are loaded via dynamic `import()`. With `tsx` or Bun, `.ts` files just work.
- **No magic** — The `MigrationRunner` is a thin wrapper around SQL. You always know what's happening.
- **Same types everywhere** — The column definitions in your migrations use the exact same syntax as `createDB()`.

This keeps PawQL true to its core promise: **The Runtime-First ORM for TypeScript**.

## Tips

1. **Name your migrations descriptively**: `create_users`, `add_email_to_posts`, `rename_status_column`.
2. **Always write a `down()`**: Even if you think you'll never rollback, it's good practice.
3. **Use raw SQL for complex operations**: Indexes, constraints, triggers — use `runner.sql()`.
4. **Test migrations locally**: Use `migrate:up` and `migrate:down` in dev before deploying.
5. **Run via `npx tsx`**: If you're on Node.js, the CLI uses `tsx` to run `.ts` migration files. Make sure `tsx` is installed as a dev dependency.
