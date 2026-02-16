# genless

**Runtime-first, type-safe database query builder** for Node.js that requires **no code generation** and **no build step**.

## Features

- **Type Safety**: Full TypeScript inference from runtime schema definition.
- **Runtime-First**: Define schema as standard JavaScript objects.
- **Zero Codegen**: No CLI to run, no files to generate.
- **Lightweight**: Minimal runtime overhead.

## Installation

```bash
npm install genless
# or
bun add genless
```

## Usage

Define your schema using standard JavaScript constructors or helper constants:

```typescript
import { createDB, number, string, date } from 'genless';

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
});

// Now use the db object to query (Implementation pending)
// const users = await db.query('users').select('id', 'name');
```

## Philosophy

Most ORMs require a separate schema definition language (Prisma, Drizzle) or complex build steps. `genless` aims to be the query builder that just works with your runtime code, providing full type safety through TypeScript inference.

## License

MIT
