# PawQL

**The Runtime-First ORM for TypeScript** — Zero code generation. Zero build step. Full type safety.

PawQL is a modern, type-safe database query builder that infers types directly from your runtime schema definition. No CLI tools, no `.prisma` files, no generated code.

[![npm version](https://img.shields.io/npm/v/pawql)](https://www.npmjs.com/package/pawql)
<!-- [![CI](https://github.com/ahmatfauzy/pawql-orm/actions/workflows/ci.yml/badge.svg)](https://github.com/ahmatfauzy/pawql-orm/actions/workflows/ci.yml) -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why PawQL?

| Feature | Prisma | Drizzle | **PawQL** |
|---------|--------|---------|-----------|
| Code Generation | ✅ Required | ⚠ Optional | ❌ **Not needed** |
| Build Step | ✅ Required | ⚠ Sometimes | ❌ **Not needed** |
| Runtime Schema | ❌ | ❌ | ✅ **Yes** |
| Type Safety | ✅ | ✅ | ✅ **Native inference** |
| Schema Definition | `.prisma` file | TypeScript schema | **Plain JS objects** |
| Learning Curve | Medium | Medium | **Low** |

## Features

- 🚀 **Runtime-First** — Define schema using plain JavaScript objects
- 🔒 **Native Type Inference** — End-to-end TypeScript support without code generation
- 🛠️ **Zero Build Step** — No CLI, no schema files, no generated clients
- ⚡ **Lightweight Core** — Minimal abstraction, ideal for serverless & edge
- 📦 **Modern** — ESM-first, works with Node.js and Bun
- 🔌 **Multi-Database** — Native adapters for PostgreSQL, MySQL, and SQLite

### Capabilities (v2.0.1)

- **CRUD**: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Filtering**: `WHERE`, `OR`, `IN`, `LIKE` (all dialects) / `ILIKE` (PostgreSQL-only), `BETWEEN`, `IS NULL`, comparison operators
- **ORDER BY**: Single/multiple column sorting with ASC/DESC
- **LIMIT / OFFSET**: Pagination support
- **Joins**: `INNER`/`LEFT` (all dialects), `RIGHT` (not SQLite), `FULL` (PostgreSQL-only) with type inference
- **Transactions**: Atomic operations with auto-rollback
- **Data Types**: `String`, `Number`, `Boolean`, `Date`, `JSON`, `UUID`, `Enum`, `Array` (PostgreSQL-only — use `json()` for MySQL/SQLite), `varchar`, `text`, `bigint`, `decimal`
- **DDL**: Auto-generate tables from schema with `db.createTables()` (dialect-aware: `UUID`→`VARCHAR(36)`/`TEXT`, `JSONB`→`JSON`/`TEXT`, etc.)
- **Controllable RETURNING**: Choose which columns to return (PostgreSQL/SQLite — auto-stripped on MySQL)
- **Shortcuts**: `.first()` for single row, `.count()` for counting
- **Migrations**: Pure runtime `Migrator` (`{migrations: Migration[]}`) — no CLI, dialect-aware tracking table
- **Raw SQL**: `db.raw(sql, params)` — escape hatch for custom queries (`$1`→`?` auto-converted for MySQL/SQLite)
- **Upsert**: `INSERT ... ON CONFLICT DO UPDATE / DO NOTHING` (PostgreSQL/SQLite — use `ON DUPLICATE KEY UPDATE` via `db.raw()` for MySQL)
- **Batch Inserts**: Transparent chunking optimization for bulk array insertions
- **GROUP BY + HAVING**: Aggregation query support
- **Subqueries**: Subqueries in WHERE and FROM clauses
- **Logger / Debug Mode**: `.toString()` dump capability to inspect raw injected SQL queries
- **Streaming**: Native AsyncGenerator `.stream()` iteration functionality for massive chunks
- **Plugins**: Extensible community adapter system setup (`PawQLPlugin`)
- **Pool Management**: Exposed connection pool options (max, idle timeout, etc.)
- **JSDoc**: Complete documentation for all public APIs
- **Soft Delete**: Native `deleted_at` handling (`.softDelete()`, `.restore()`, `.withTrashed()`, `.onlyTrashed()`)
- **Integration Tests**: Comprehensive tests with real PostgreSQL via Docker
- **Seeders**: `seed()` and `createSeeder()` for populating initial data with validation
- **Parameter Validation**: Runtime `validateRow()` and `assertValid()` checks against schema types
- **Query Timeout**: `.timeout(ms)` support with `PawQLTimeoutError` for canceling long-running queries
- **Hooks / Middleware**: `db.hook()` for `beforeInsert`, `afterUpdate`, etc. with data mutation support
- **Relations**: `hasMany`, `belongsTo`, `hasOne` with `.with()` auto-joins
- **Multi-Database**: Use `PostgresAdapter`, `MysqlAdapter`, or `SqliteAdapter` interchangeably
- **Introspection**: `introspectDatabase()` runtime API safely reverse-engineers legacy DB schemas without forcing CLI templates.

## When Should You Use PawQL?

Use PawQL if you:

- Prefer runtime schema over DSL files
- Want type inference without code generation
- Need a lightweight alternative to heavy ORMs
- Work in serverless or edge environments
- Prefer clean, minimal APIs

## Installation

```bash
# Core
npm install pawql

# Pick your database driver:
npm install pg              # PostgreSQL
npm install mysql2          # MySQL / MariaDB
npm install better-sqlite3  # SQLite (Node.js) — Bun has built-in support
```

> Install only the driver you need. PawQL will auto-detect the runtime (Node.js or Bun) for SQLite.

## Quick Start

```typescript
import { connect } from 'pawql';

// 1. Define your schema using standard JavaScript constructors or custom PawQL markers
// 2. Pass in the Connection Dialect String directly.
const db = await connect({
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    isActive: { type: Boolean, default: true },
    createdAt: Date,
  }
}, 'postgres://user:pass@localhost:5432/mydb');

// 3. Optional: Sync tables dynamically to DB (great for prototyping)
await db.createTables();

// 3. Insert data
await db.query('users')
  .insert({ id: 1, name: 'Alice', email: 'alice@example.com', age: 28 })
  .execute();

// 4. Query with full type inference
const activeUsers = await db.query('users')
  .select('id', 'name')
  .where({ isActive: true })
  .orderBy('name', 'ASC')
  .limit(10)
  .execute();

// 5. Get a single row
const user = await db.query('users')
  .where({ id: 1 })
  .first(); // Returns single object or null

// 6. Count rows
const total = await db.query('users')
  .where({ isActive: true })
  .count(); // Returns number
```

## Soft Delete

PawQL supports native soft delete — mark records as deleted instead of removing them:

```typescript
const db = createDB(schema, adapter, {
  softDelete: {
    tables: ['users', 'posts'],   // Enable for specific tables
    column: 'deleted_at',          // Optional, default
  },
});

// Soft delete (sets deleted_at = NOW())
await db.query('users').where({ id: 1 }).softDelete().execute();

// Default queries automatically exclude soft-deleted rows
const users = await db.query('users').execute(); // Only non-deleted

// Include soft-deleted rows
const all = await db.query('users').withTrashed().execute();

// Only soft-deleted rows
const deleted = await db.query('users').onlyTrashed().execute();

// Restore a soft-deleted row
await db.query('users').where({ id: 1 }).restore().execute();
```

See **[Soft Delete Guide](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/soft-delete.md)** for full details.

## Seeders

PawQL includes a built-in seeder to populate your database with initial or test data:

```typescript
import { seed } from 'pawql';

await seed(db, {
  users: [
    { id: 1, name: 'Alice', email: 'alice@example.com', age: 28 },
    { id: 2, name: 'Bob', email: 'bob@example.com', age: 32 },
  ],
  posts: [
    { id: 1, userId: 1, title: 'Hello World', content: '...' },
  ],
}, {
  truncate: true,       // Clear tables first
  validate: true,       // Validate against schema
  transaction: true,    // Atomic operation
});
```

See **[Seeders Guide](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/seeders.md)** for full details.

## Parameter Validation

Catch type mismatches before they hit the database:

```typescript
import { validateRow, assertValid, PawQLValidationError } from 'pawql';

// Non-throwing validation
const result = validateRow({ id: 'wrong', name: 123 }, schema.users);
console.log(result.valid);   // false
console.log(result.errors);  // [{ column: 'id', message: '...', ... }]

// Throwing validation
try {
  assertValid(data, schema.users, 'users');
} catch (e) {
  if (e instanceof PawQLValidationError) {
    console.log(e.table);    // 'users'
    console.log(e.details);  // structured error details
  }
}
```

Supports all types: `Number`, `String`, `Boolean`, `Date`, `UUID`, `Enum`, `Array`, `JSON` — including nested array element validation.

See **[Parameter Validation Guide](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/validation.md)** for full details.

## Query Timeout

Prevent long-running queries from blocking your application:

```typescript
import { PawQLTimeoutError } from 'pawql';

try {
  const users = await db.query('users')
    .timeout(5000)  // 5 seconds
    .execute();
} catch (e) {
  if (e instanceof PawQLTimeoutError) {
    console.log(`Query timed out after ${e.timeoutMs}ms`);
  }
}
```

See **[Query Timeout Guide](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/query-timeout.md)** for full details.

## Streaming Large Data
Use `.stream()` to retrieve rows natively using Generator bounds, avoiding Memory OOM:

```typescript
for await (const chunk of db.query('users').stream(100)) {
  console.log(`Processing batch of ${chunk.length}`);
}
```

See **[Streaming Guide](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/streaming.md)** for full details.

## Hooks / Middleware

Register lifecycle hooks for cross-cutting concerns:

```typescript
// Auto-add timestamps
db.hook('users', 'beforeInsert', (ctx) => {
  if (ctx.data && !Array.isArray(ctx.data)) {
    ctx.data.createdAt = new Date();
  }
});

// Global audit logging
db.hook('*', 'afterInsert', (ctx) => {
  console.log(`Inserted into ${ctx.table}`);
});

// Block dangerous operations
db.hook('admin_settings', 'beforeDelete', () => {
  throw new Error('Cannot delete admin settings!');
});
```

See **[Hooks Guide](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/hooks.md)** for full details.

## Relations

Define relationships for auto-joins with `.with()`:

```typescript
import { defineRelations, hasMany, belongsTo, hasOne } from 'pawql';

const relations = defineRelations({
  users: {
    posts: hasMany('posts', 'userId'),
    profile: hasOne('profiles', 'userId'),
  },
  posts: {
    author: belongsTo('users', 'userId'),
  },
});

const db = createDB(schema, adapter, { relations });

// Auto-join — no manual join columns!
const usersWithPosts = await db.query('users')
  .with('posts')
  .with('profile')
  .execute();
// → SELECT * FROM "users"
//   LEFT JOIN "posts" ON "users"."id" = "posts"."userId"
//   LEFT JOIN "profiles" ON "users"."id" = "profiles"."userId"
```

See **[Relations Guide](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/relations.md)** for full details.

## Advanced Types

```typescript
import { createDB, uuid, json, enumType, arrayType, varchar, decimal } from 'pawql';

const db = createDB({
  events: {
    id: uuid,                                    // UUID (pg) / VARCHAR(36) (mysql) / TEXT (sqlite)
    name: varchar(255),                          // VARCHAR(255)
    type: enumType('conference', 'meetup'),       // TEXT + CHECK constraint
    tags: arrayType(String),                     // TEXT[] — PostgreSQL-only (use json() for MySQL/SQLite)
    fee: decimal(5, 2),                          // DECIMAL(5, 2)
    details: json<{ location: string }>(),       // JSONB (pg) / JSON (mysql) / TEXT (sqlite) with TypeScript generic
    createdAt: Date,                             // TIMESTAMP
  }
}, adapter);
```

## Migrations

PawQL includes a pure runtime migration system — **no CLI, no files, no code generation**. Migrations are plain objects defined in your codebase and executed via `Migrator` at runtime.

```typescript
import { Migrator } from 'pawql';
import type { Migration } from 'pawql';

const migrations: Migration[] = [
  {
    name: '20260224_create_users',
    async up(runner) {
      await runner.createTable('users', {
        id: { type: Number, primaryKey: true },
        name: String,
        email: { type: String, nullable: true },
      });
    },
    async down(runner) {
      await runner.dropTable('users');
    },
  },
];

// Run all pending migrations (e.g. in server startup)
const migrator = new Migrator(adapter, { migrations });
await migrator.up();

// Rollback last batch
await migrator.down();
```

See **[Migrations Guide](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/migrations.md)** for full details.

## Documentation

For complete documentation, see the **[docs/](https://github.com/ahmatfauzy/pawql-orm/tree/main/docs)** directory:

- **[Getting Started](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/getting-started.md)** — Installation, setup, first query, logger & pool config
- **[Schema Definition](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/schema.md)** — Defining tables, columns, and types
- **[Querying](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/querying.md)** — SELECT, WHERE, ORDER BY, joins, GROUP BY, HAVING, subqueries, raw SQL
- **[Mutations](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/mutations.md)** — INSERT, UPDATE, DELETE, RETURNING, upsert (ON CONFLICT)
- **[Transactions](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/transactions.md)** — Atomic operations
- **[Migrations](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/migrations.md)** — Database migrations (pure runtime, no CLI)
- **[Soft Delete](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/soft-delete.md)** — Soft delete with `.withTrashed()`, `.onlyTrashed()`
- **[Seeders](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/seeders.md)** — Populate initial data with `seed()` and `createSeeder()`
- **[Parameter Validation](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/validation.md)** — Runtime type validation with `validateRow()` and `assertValid()`
- **[Query Timeout](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/query-timeout.md)** — Cancel long-running queries with `.timeout(ms)`
- **[Hooks / Middleware](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/hooks.md)** — Lifecycle hooks: `beforeInsert`, `afterUpdate`, etc.
- **[Relations](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/relations.md)** — `hasMany`, `belongsTo`, `hasOne` with `.with()` auto-joins
- **[Multi-Database](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/adapters.md)** — PostgreSQL, MySQL/MariaDB, SQLite native adapters
- **[Introspection](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/introspection.md)** — programmatic reverse-engineering of schemas
- **[Testing](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/testing.md)** — Using DummyAdapter for unit tests + Docker integration tests
- **[Streaming](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/streaming.md)** — Async execution arrays using native Generator streams.
- **[Plugins](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/plugins.md)** — Hook community integrations globally via `PawQLPlugin`.
- **[API Reference](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/api-reference.md)** — Complete API listing (logger, pool, all methods)

## Philosophy

Most ORMs require a separate schema definition language or complex build steps. **PawQL** takes a different approach: your schema is just JavaScript. TypeScript infers everything at compile time, giving you full autocomplete and type checking without any extra tooling.

## License

MIT — [Ahmat Fauzi](https://github.com/ahmatfauzy)
