# Getting Started

A complete guide to get up and running with PawQL.

## Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **TypeScript** 5+
- A supported database: **PostgreSQL**, **MySQL/MariaDB**, or **SQLite**

## Installation

```bash
npm install pawql

# Install your database driver:
npm install pg              # PostgreSQL
npm install mysql2          # MySQL / MariaDB
npm install better-sqlite3  # SQLite (Node.js — Bun has built-in support)
```

> Install only the driver you need. PawQL auto-detects the runtime for SQLite.

## First Setup

### 1. Create a Database Connection

```typescript
import { connect } from 'pawql';

const db = await connect({
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    email: { type: String, nullable: true },
    isActive: { type: Boolean, default: true },
  }
}, 'postgresql://user:password@localhost:5432/mydb');

// Alternatively via manual imports:
// import { createDB, PostgresAdapter } from 'pawql';
// const db = createDB(schema, new PostgresAdapter(...));
```

### 2. Synchronize Database (DDL)

PawQL can automatically create tables based on your schema:

```typescript
await db.createTables();
// Runs: CREATE TABLE IF NOT EXISTS "users" (...)
```

> **Note**: `createTables()` only creates tables that don't already exist. This is intended for development/prototyping — use a migration tool for production.

### 3. Your First Query

```typescript
// Insert
await db.query('users')
  .insert({ id: 1, name: 'Alice', email: 'alice@example.com' })
  .execute();

// Select
const users = await db.query('users')
  .where({ isActive: true })
  .execute();

console.log(users); 
// [{ id: 1, name: 'Alice', email: 'alice@example.com', isActive: true }]
```

### 4. Close the Connection

```typescript
await db.close();
```

## Adapter Configuration

### PostgreSQL

```typescript
import { PostgresAdapter } from 'pawql';

const adapter = new PostgresAdapter({
  connectionString: 'postgresql://user:pass@host:5432/db',
  // or individual parameters:
  // host: 'localhost', port: 5432, database: 'mydb', user: 'postgres', password: 'secret',
  max: 20,                    // Max pool connections
  idleTimeoutMillis: 30000,   // Close idle clients after 30s
});
```

### MySQL / MariaDB

```typescript
import { MysqlAdapter } from 'pawql';

const adapter = new MysqlAdapter({
  host: 'localhost',
  user: 'root',
  password: 'secret',
  database: 'mydb',
});
```

### SQLite

```typescript
import { SqliteAdapter } from 'pawql';

const adapter = new SqliteAdapter('mydb.sqlite');
// or ':memory:' for in-memory databases (great for testing)
```

See the **[Adapters Guide](./adapters.md)** for more details.

## Recommended Project Structure

```
my-app/
├── src/
│   ├── db/
│   │   ├── schema.ts     ← Schema definition
│   │   └── connection.ts ← Database connection
│   ├── services/         ← Business logic
│   └── index.ts
├── test/
│   └── *.test.ts
├── package.json
└── tsconfig.json
```

### `src/db/schema.ts`

```typescript
export const schema = {
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    email: { type: String, nullable: true },
    isActive: { type: Boolean, default: true },
  },
  posts: {
    id: { type: Number, primaryKey: true },
    userId: Number,
    title: String,
    content: String,
    publishedAt: { type: Date, nullable: true },
  }
} as const;
```

### `src/db/connection.ts`

```typescript
import { connect, consoleLogger } from 'pawql';
import { schema } from './schema.js';

export const db = await connect(
  schema, 
  process.env.DATABASE_URL!, 
  { logger: consoleLogger } // Optional: log all SQL to console
);
```

## Next Steps

- [Schema Definition](./schema.md) — Learn how to define columns and data types
- [Querying](./querying.md) — Learn how to query data
- [Mutations](./mutations.md) — Learn about INSERT, UPDATE, DELETE
