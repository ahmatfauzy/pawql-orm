# genless

**Runtime-first, type-safe database query builder** for Node.js that requires **no code generation** and **no build step**.

## Features

- **Type Safety**: Full TypeScript inference from runtime schema definition.
- **Runtime-First**: Define schema as standard JavaScript objects.
- **Zero Codegen**: No CLI to run, no files to generate.
- **Lightweight**: Minimal runtime overhead.

## Installation

```bash
# Install genless and dependencies
npm install genless pg
# or
bun add genless pg
```

> **Note**: You must install `pg` separately as it is a peer dependency for PostgreSQL support.

## Usage

Define your schema using standard JavaScript constructors or helper constants:

```typescript
import { createDB, number, string, boolean, date, PostgresAdapter } from 'genless';

// 1. Define Schema
const db = createDB({
  users: {
    id: number,
    name: string,
    email: string,
    created_at: date
  },
  posts: {
    id: number,
    title: string,
    content: string,
    published: boolean
  }
}, new PostgresAdapter({
  connectionString: process.env.DATABASE_URL
}));

// 2. Query Data
async function main() {
  // Select specific columns with type inference
  const users = await db.query('users')
    .select('id', 'name')
    .where('name', '=', 'Alice')
    .limit(10);
  
  console.log(users); // inferred as { id: number, name: string }[]
  
  // Close connection when done
  await db.close();
}

main();
```

## Philosophy

Most ORMs require a separate schema definition language (Prisma, Drizzle) or complex build steps. `genless` aims to be the query builder that just works with your runtime code, providing full type safety through TypeScript inference.

## License

MIT
