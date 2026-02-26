# PawQL

**The Runtime-First ORM for TypeScript** — Zero code generation. Zero build step. Full type safety.

PawQL is a modern, type-safe database query builder that infers types directly from your runtime schema definition. No CLI tools, no `.prisma` files, no generated code.

[![npm version](https://img.shields.io/npm/v/pawql)](https://www.npmjs.com/package/pawql)
![npm downloads](https://img.shields.io/npm/dw/pawql)
[![CI](https://github.com/ahmatfauzy/pawql-orm/actions/workflows/ci.yml/badge.svg)](https://github.com/ahmatfauzy/pawql-orm/actions/workflows/ci.yml)
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

### Capabilities (v0.5.0)

- **CRUD**: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Filtering**: `WHERE`, `OR`, `IN`, `LIKE`, `BETWEEN`, `IS NULL`, comparison operators
- **ORDER BY**: Single/multiple column sorting with ASC/DESC
- **LIMIT / OFFSET**: Pagination support
- **Joins**: `INNER`, `LEFT`, `RIGHT`, `FULL` JOIN with type inference
- **Transactions**: Atomic operations with auto-rollback
- **Data Types**: `String`, `Number`, `Boolean`, `Date`, `JSON`, `UUID`, `Enum`, `Array`
- **DDL**: Auto-generate tables from schema with `db.createTables()`
- **Controllable RETURNING**: Choose which columns to return from mutations
- **Shortcuts**: `.first()` for single row, `.count()` for counting
- **Migrations**: `migrate:make`, `migrate:up`, `migrate:down` 
- **Raw SQL**: `db.raw(sql, params)` — escape hatch for custom queries
- **Upsert**: `INSERT ... ON CONFLICT DO UPDATE / DO NOTHING`
- **GROUP BY + HAVING**: Aggregation query support
- **Subqueries**: Subqueries in WHERE and FROM clauses
- **Logger / Debug Mode**: Built-in `consoleLogger` to inspect generated SQL
- **Pool Management**: Exposed connection pool options (max, idle timeout, etc.)
- **JSDoc**: Complete documentation for all public APIs

## When Should You Use PawQL?

Use PawQL if you:

- Prefer runtime schema over DSL files
- Want type inference without code generation
- Need a lightweight alternative to heavy ORMs
- Work in serverless or edge environments
- Prefer clean, minimal APIs

## Installation

```bash
npm install pawql pg
```

> `pg` is a peer dependency for PostgreSQL connectivity.

## Quick Start

```typescript
import { createDB, PostgresAdapter } from 'pawql';

// 1. Define your schema using plain JS objects
const db = createDB({
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    email: { type: String, nullable: true },
    age: Number,
    isActive: { type: Boolean, default: true },
  },
  posts: {
    id: { type: Number, primaryKey: true },
    userId: Number,
    title: String,
    content: String,
  }
}, new PostgresAdapter({ connectionString: process.env.DATABASE_URL }));

// 2. Create tables (DDL)
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

## Advanced Types

```typescript
import { createDB, PostgresAdapter, uuid, json, enumType, arrayType } from 'pawql';

const db = createDB({
  events: {
    id: uuid,                                    // UUID
    name: String,                                // TEXT
    type: enumType('conference', 'meetup'),       // TEXT + CHECK constraint
    tags: arrayType(String),                     // TEXT[]
    details: json<{ location: string }>(),       // JSONB with TypeScript generic
    createdAt: Date,                             // TIMESTAMP
  }
}, adapter);
```

## Migrations

PawQL includes a migration system that stays true to its runtime-first philosophy — **no code generation**, just plain TypeScript migration files using the same schema types you already know.

```bash
# Create a new migration file
npx pawql migrate:make create_users

# Run all pending migrations
npx pawql migrate:up

# Rollback the last batch
npx pawql migrate:down
```

Migration files use PawQL's runtime schema types:

```typescript
import type { MigrationRunner } from 'pawql';

export default {
  async up(runner: MigrationRunner) {
    await runner.createTable('users', {
      id: { type: Number, primaryKey: true },
      name: String,
      email: { type: String, nullable: true },
    });
  },

  async down(runner: MigrationRunner) {
    await runner.dropTable('users');
  },
};
```

See **[Migrations Guide](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/migrations.md)** for full details.

## Documentation

For complete documentation, see the **[docs/](https://github.com/ahmatfauzy/pawql-orm/tree/main/docs)** directory:

- **[Getting Started](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/getting-started.md)** — Installation, setup, first query, logger & pool config
- **[Schema Definition](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/schema.md)** — Defining tables, columns, and types
- **[Querying](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/querying.md)** — SELECT, WHERE, ORDER BY, joins, GROUP BY, HAVING, subqueries, raw SQL
- **[Mutations](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/mutations.md)** — INSERT, UPDATE, DELETE, RETURNING, upsert (ON CONFLICT)
- **[Transactions](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/transactions.md)** — Atomic operations
- **[Migrations](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/migrations.md)** — Database migrations with CLI
- **[Testing](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/testing.md)** — Using DummyAdapter for testing
- **[API Reference](https://github.com/ahmatfauzy/pawql-orm/blob/main/docs/api-reference.md)** — Complete API listing (logger, pool, all methods)

## Philosophy

Most ORMs require a separate schema definition language or complex build steps. **PawQL** takes a different approach: your schema is just JavaScript. TypeScript infers everything at compile time, giving you full autocomplete and type checking without any extra tooling.

## License

MIT — [Ahmat Fauzi](https://github.com/ahmatfauzy)
