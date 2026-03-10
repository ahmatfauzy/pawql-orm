# Schema Introspection

PawQL provides a CLI tool to automatically generate a `DatabaseSchema` object from an existing database. This is very useful when adopting PawQL into a project that already has an established database schema.

## Supported Databases
Introspection is supported for:
- **PostgreSQL**
- **MySQL / MariaDB**
- **SQLite**

## Usage

First, ensure you have a `pawql.config.ts` (or `.js`) file in your project root that exports your DatabaseAdapter:

```typescript
// pawql.config.ts
import { PostgresAdapter } from 'pawql';

export default {
  adapter: new PostgresAdapter({ connectionString: 'postgres://user:pass@localhost:5432/mydb' }),
};
```

Then, run the introspect command:

```bash
npx pawql introspect
```

By default, this will scan your database and create a `schema.ts` file in the current directory.

### Custom Output File

You can specify a custom output path:

```bash
npx pawql introspect my-schema.ts
```

## Generated Code

The command generates a standard PawQL schema definition. It automatically maps native SQL types to PawQL types (`Number`, `String`, `Boolean`, `Date`, etc.) and determines nullability and primary keys.

**Example `schema.ts` output:**
```typescript
import type { DatabaseSchema } from "pawql";

export const schema = {
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    email: String,
    created_at: { type: Date, nullable: true },
  },
  posts: {
    id: { type: Number, primaryKey: true },
    title: String,
    user_id: Number,
  },
} satisfies DatabaseSchema;
```

You can then import this `schema` object to initialize your `createDB()` instance.
