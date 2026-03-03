# Seeders

PawQL includes a built-in seeder utility for populating your database with initial or test data. Like everything in PawQL, seeders are runtime-first — no CLI, no generated files, just plain TypeScript.

## Basic Usage

```typescript
import { createDB, PostgresAdapter, seed } from 'pawql';

const schema = {
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    email: { type: String, nullable: true },
    age: Number,
  },
  posts: {
    id: { type: Number, primaryKey: true },
    userId: Number,
    title: String,
    content: String,
  },
};

const db = createDB(schema, new PostgresAdapter({
  connectionString: process.env.DATABASE_URL,
}));

// Seed your database
await seed(db, {
  users: [
    { id: 1, name: 'Alice', email: 'alice@example.com', age: 28 },
    { id: 2, name: 'Bob', email: 'bob@example.com', age: 32 },
    { id: 3, name: 'Carol', email: null, age: 24 },
  ],
  posts: [
    { id: 1, userId: 1, title: 'Hello World', content: 'My first post' },
    { id: 2, userId: 2, title: 'TypeScript Tips', content: 'Use PawQL!' },
  ],
});
```

## Options

```typescript
await seed(db, data, {
  truncate: true,       // Delete existing rows before seeding (default: false)
  validate: true,       // Validate data against schema (default: true)
  transaction: true,    // Wrap in a transaction (default: true)
  onSeed: (table, count) => {
    console.log(`✓ Seeded ${count} rows into ${table}`);
  },
});
```

### Option Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `truncate` | `boolean` | `false` | Delete all rows from each table before seeding |
| `validate` | `boolean` | `true` | Validate each row against the schema before inserting |
| `validateOptions` | `ValidateOptions` | `{}` | Options passed to the validator (see [Parameter Validation](./validation.md)) |
| `transaction` | `boolean` | `true` | Wrap all operations in a single transaction |
| `onSeed` | `(table, count) => void` | — | Callback invoked after each table is seeded |

## Seed Result

The `seed()` function returns a `SeedResult` object:

```typescript
const result = await seed(db, data);

console.log(result.totalRows);  // 5
console.log(result.tables);
// [
//   { name: 'users', rows: 3 },
//   { name: 'posts', rows: 2 },
// ]
```

## Truncate Before Seeding

Use the `truncate` option to clear tables before inserting:

```typescript
await seed(db, {
  users: [
    { id: 1, name: 'Fresh Data', age: 25 },
  ],
}, { truncate: true });
```

This runs `DELETE FROM "table"` before each table's insert. Combined with `transaction: true` (the default), the truncate and insert are atomic.

## Schema Validation

By default, the seeder validates every row against your schema before inserting. This catches type mismatches, missing required columns, and invalid enum/UUID values *before* hitting the database:

```typescript
// This will throw a PawQLValidationError
await seed(db, {
  users: [
    { id: 'not-a-number', name: 123, age: 'wrong' }, // All wrong!
  ],
});
// Error: Validation failed for table "users":
//   id: Expected a number, got string
//   name: Expected a string, got number
//   age: Expected a number, got string
```

To skip validation (e.g., for performance with large datasets):

```typescript
await seed(db, data, { validate: false });
```

## Reusable Seeder

Use `createSeeder()` to create a reusable seeder function with default options:

```typescript
import { createDB, PostgresAdapter, createSeeder } from 'pawql';

const db = createDB(schema, adapter);

const seeder = createSeeder(db, {
  validate: true,
  transaction: true,
  onSeed: (table, count) => console.log(`✓ ${table}: ${count} rows`),
});

// Use it multiple times
await seeder({
  users: [
    { id: 1, name: 'Alice', age: 28 },
  ],
});

await seeder({
  posts: [
    { id: 1, userId: 1, title: 'Hello', content: 'World' },
  ],
});
```

You can override default options per call:

```typescript
await seeder(data, { truncate: true });
```

## Test Fixtures

Seeders work great with the `DummyAdapter` for unit tests:

```typescript
import { createDB, seed } from 'pawql';
import { DummyAdapter } from 'pawql/testing';

const adapter = new DummyAdapter();
const db = createDB(schema, adapter);

await seed(db, {
  users: [
    { id: 1, name: 'Test User', age: 25 },
  ],
});

// Inspect generated SQL
console.log(adapter.logs);
```

## Error Handling

The seeder throws errors in these cases:

1. **Unknown table** — If you try to seed a table that doesn't exist in your schema:
   ```
   Error: Seed error: Table "nonexistent" does not exist in the schema.
   ```

2. **Validation failure** — If `validate: true` and data doesn't match the schema:
   ```
   PawQLValidationError: Validation failed for table "users":
     id: Expected a number, got string
   ```

3. **Database error** — If the underlying INSERT fails (e.g., unique constraint violation). When `transaction: true`, the entire operation is rolled back.

## API Summary

| Function | Description |
|----------|-------------|
| `seed(db, data, options?)` | Seed the database with data |
| `createSeeder(db, defaultOptions?)` | Create a reusable seeder function |

See the [API Reference](./api-reference.md) for full type signatures.
