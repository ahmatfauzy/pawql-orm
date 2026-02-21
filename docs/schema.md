# Schema Definition

PawQL uses plain JavaScript objects to define your database schema. TypeScript automatically infers types from these definitions.

## Basic Types

Use standard JavaScript constructors as column types:

```typescript
const schema = {
  users: {
    id: Number,        // → INTEGER
    name: String,      // → TEXT
    isActive: Boolean, // → BOOLEAN
    createdAt: Date,   // → TIMESTAMP
  }
};
```

### Type Mapping

| JavaScript | PostgreSQL | TypeScript |
|-----------|------------|------------|
| `Number` | `INTEGER` | `number` |
| `String` | `TEXT` | `string` |
| `Boolean` | `BOOLEAN` | `boolean` |
| `Date` | `TIMESTAMP` | `Date` |

## Column Options

For more advanced configuration, use an object definition:

```typescript
const schema = {
  users: {
    // Primary key
    id: { type: Number, primaryKey: true },
    
    // Nullable column
    email: { type: String, nullable: true },
    
    // Default value
    isActive: { type: Boolean, default: true },
    score: { type: Number, default: 0 },
    role: { type: String, default: 'user' },
  }
};
```

### Available Options

| Option | Type | Description |
|--------|------|-------------|
| `type` | `ColumnTypeValue` | Column type (required for object definitions) |
| `primaryKey` | `boolean` | Mark as primary key |
| `nullable` | `boolean` | Allow `NULL` (default: `false`) |
| `default` | `any` | Default value |

## Advanced Types

PawQL provides helper functions for advanced data types.

### UUID

```typescript
import { uuid } from 'pawql';

const schema = {
  users: {
    id: uuid,    // → UUID, TypeScript type: string
    name: String,
  }
};
```

**Generated DDL:**
```sql
CREATE TABLE IF NOT EXISTS "users" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL
);
```

### JSON / JSONB

```typescript
import { json } from 'pawql';

const schema = {
  products: {
    id: { type: Number, primaryKey: true },
    metadata: json<{ 
      tags: string[]; 
      color: string;
      dimensions?: { width: number; height: number };
    }>(),
  }
};
```

- The `metadata` column maps to `JSONB` in PostgreSQL
- TypeScript knows that `metadata` is of type `{ tags: string[]; color: string; ... }`
- The generic parameter `<T>` provides type safety for the JSON data

**Generated DDL:**
```sql
"metadata" JSONB NOT NULL
```

### Enum

```typescript
import { enumType } from 'pawql';

const schema = {
  users: {
    id: { type: Number, primaryKey: true },
    role: enumType('admin', 'user', 'guest'),
    status: enumType('active', 'inactive', 'banned'),
  }
};
```

- Generates a `TEXT` column with a `CHECK` constraint
- TypeScript type: union literal (`'admin' | 'user' | 'guest'`)

**Generated DDL:**
```sql
"role" TEXT NOT NULL CHECK ("role" IN ('admin', 'user', 'guest'))
```

### Array

```typescript
import { arrayType } from 'pawql';

const schema = {
  posts: {
    id: { type: Number, primaryKey: true },
    tags: arrayType(String),    // → TEXT[], TypeScript: string[]
    scores: arrayType(Number),  // → INTEGER[], TypeScript: number[]
  }
};
```

**Generated DDL:**
```sql
"tags" TEXT[] NOT NULL,
"scores" INTEGER[] NOT NULL
```

## Multiple Tables

```typescript
import { createDB, PostgresAdapter, uuid, enumType } from 'pawql';

const db = createDB({
  users: {
    id: uuid,
    name: String,
    email: { type: String, nullable: true },
    role: enumType('admin', 'user'),
  },
  posts: {
    id: { type: Number, primaryKey: true },
    userId: Number,       // Foreign key (manual)
    title: String,
    content: String,
    publishedAt: { type: Date, nullable: true },
  },
  comments: {
    id: { type: Number, primaryKey: true },
    postId: Number,
    userId: Number,
    text: String,
    createdAt: Date,
  }
}, adapter);
```

## Type Inference

PawQL automatically infers types from your schema. No need to define interfaces manually:

```typescript
// TypeScript knows that:
// - users.id → string (because of uuid)
// - users.role → 'admin' | 'user' (because of enumType)
// - posts.publishedAt → Date | null (because of nullable)

const users = await db.query('users').execute();
// Type: { id: string; name: string; email: string | null; role: 'admin' | 'user' }[]

const posts = await db.query('posts').execute();
// Type: { id: number; userId: number; title: string; content: string; publishedAt: Date | null }[]
```

## DDL (Create Tables)

```typescript
// Create all tables defined in the schema
await db.createTables();
```

This runs `CREATE TABLE IF NOT EXISTS` for each table. It's safe to run multiple times — existing tables will not be affected.

## Next Steps

- [Querying](./querying.md) — How to query data
- [Mutations](./mutations.md) — INSERT, UPDATE, DELETE
- [API Reference](./api-reference.md) — Complete API reference
