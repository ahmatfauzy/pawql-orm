# Getting Started

A complete guide to get up and running with PawQL.

## Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **TypeScript** 5+
- **PostgreSQL** database

## Installation

```bash
# Using npm
npm install pawql pg

# Using Bun
bun add pawql pg
```

> **Note**: `pg` is a peer dependency. You must install it alongside PawQL.

## First Setup

### 1. Create a Database Connection

```typescript
import { createDB, PostgresAdapter } from 'pawql';

const db = createDB({
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    email: { type: String, nullable: true },
    isActive: { type: Boolean, default: true },
  }
}, new PostgresAdapter({
  connectionString: 'postgresql://user:password@localhost:5432/mydb'
}));
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

## PostgresAdapter Configuration

```typescript
const adapter = new PostgresAdapter({
  // Option 1: Connection string
  connectionString: 'postgresql://user:pass@host:5432/db',
  
  // Option 2: Individual parameters
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'secret',
  
  // Connection pool (optional)
  max: 20,           // Max connections in pool
  idleTimeoutMillis: 30000,
});
```

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
import { createDB, PostgresAdapter, consoleLogger } from 'pawql';
import { schema } from './schema.js';

export const db = createDB(schema, new PostgresAdapter({
  connectionString: process.env.DATABASE_URL!,
  max: 20,                    // Max pool connections
  idleTimeoutMillis: 30000,   // Close idle clients after 30s
}), {
  logger: consoleLogger,      // Optional: log all SQL to console
});
```

## Next Steps

- [Schema Definition](./schema.md) — Learn how to define columns and data types
- [Querying](./querying.md) — Learn how to query data
- [Mutations](./mutations.md) — Learn about INSERT, UPDATE, DELETE
