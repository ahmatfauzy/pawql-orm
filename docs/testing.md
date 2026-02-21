# Testing

PawQL provides a `DummyAdapter` for testing without a real database connection. This adapter records all executed SQL so you can assert against the generated queries.

## Installation

`DummyAdapter` is available via a separate subpath import, kept out of production code:

```typescript
// ✅ Correct — import from the testing subpath
import { DummyAdapter } from 'pawql/testing';

// ❌ Wrong — not available from the main import
import { DummyAdapter } from 'pawql'; // Error!
```

> **Why is it separate?** So that `DummyAdapter` doesn't end up in your production bundle. See [Philosophy](#philosophy) below.

## Basic Usage

```typescript
import { test } from 'node:test';
import assert from 'node:assert';
import { createDB } from 'pawql';
import { DummyAdapter } from 'pawql/testing';

const schema = {
  users: {
    id: Number,
    name: String,
    email: String,
  }
};

test('should generate correct SELECT SQL', async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db.query('users')
    .select('id', 'name')
    .where({ id: 1 })
    .execute();

  // Check the generated SQL
  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT "id", "name" FROM "users" WHERE "id" = $1');
  assert.deepStrictEqual(lastLog.params, [1]);
});
```

## DummyAdapter API

### `adapter.logs`

An array containing all executed queries:

```typescript
type LogEntry = {
  sql: string;     // The SQL string that was executed
  params: any[];   // Parameter values
};

adapter.logs; // LogEntry[]
```

### Inspecting Logs

```typescript
const adapter = new DummyAdapter();
const db = createDB(schema, adapter);

await db.query('users').insert({ id: 1, name: 'Alice' }).execute();
await db.query('users').where({ id: 1 }).execute();

console.log(adapter.logs);
// [
//   { sql: 'INSERT INTO "users" ...', params: [1, 'Alice'] },
//   { sql: 'SELECT * FROM "users" WHERE "id" = $1', params: [1] }
// ]

// Access the last log entry
const lastQuery = adapter.logs[adapter.logs.length - 1]!;
```

### Shared Logs (Transactions)

When testing transactions, `DummyAdapter` automatically shares logs across transaction adapters:

```typescript
test('transaction logs BEGIN/COMMIT', async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db.transaction(async (tx) => {
    await tx.query('users').insert({ id: 1 }).execute();
  });

  assert.strictEqual(adapter.logs[0]!.sql, 'BEGIN');
  assert.ok(adapter.logs[1]!.sql.includes('INSERT'));
  assert.strictEqual(adapter.logs[2]!.sql, 'COMMIT');
});
```

## Testing Patterns

### Pattern 1: Verify SQL Generation

```typescript
test('generates correct SQL', async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db.query('users')
    .where({ age: { gt: 18 } })
    .orderBy('name', 'ASC')
    .limit(10)
    .execute();

  const log = adapter.logs[0]!;
  assert.strictEqual(
    log.sql,
    'SELECT * FROM "users" WHERE "age" > $1 ORDER BY "name" ASC LIMIT 10'
  );
  assert.deepStrictEqual(log.params, [18]);
});
```

### Pattern 2: Verify Parameters

```typescript
test('passes correct parameters', async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db.query('users')
    .insert({ id: 1, name: 'Alice', email: 'alice@test.com' })
    .execute();

  const log = adapter.logs[0]!;
  assert.strictEqual(log.params.length, 3);
  assert.strictEqual(log.params[0], 1);
  assert.strictEqual(log.params[1], 'Alice');
  assert.strictEqual(log.params[2], 'alice@test.com');
});
```

### Pattern 3: Fresh Adapter per Test

```typescript
// ✅ Each test gets a fresh adapter — logs don't leak between tests
test('test 1', async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  // ...
});

test('test 2', async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  // ... adapter.logs starts empty
});
```

### Pattern 4: DDL Testing

```typescript
test('creates correct table DDL', async () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    products: {
      id: { type: Number, primaryKey: true },
      name: String,
      price: Number,
    }
  }, adapter);

  await db.createTables();

  const sql = adapter.logs[0]!.sql;
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS "products"'));
  assert.ok(sql.includes('"id" INTEGER PRIMARY KEY'));
  assert.ok(sql.includes('"name" TEXT NOT NULL'));
  assert.ok(sql.includes('"price" INTEGER NOT NULL'));
});
```

## Compatible Test Runners

PawQL tests use the `node:test` module, which is compatible with:

- **Node.js** 18+ (`npx tsx --test test/*.test.ts`)
- **Bun** (`bun test`)

```json
// package.json
{
  "scripts": {
    "test": "npx tsx --test test/*.test.ts",
    "test:bun": "bun test"
  }
}
```

## Philosophy

`DummyAdapter` is separated from production exports because:

1. **Bundle size** — Test utilities shouldn't end up in production builds
2. **Clean API** — Users only see what they need in autocomplete
3. **Separation of concerns** — Production code vs test utilities
4. **Industry standard** — Similar to `@angular/core/testing`, `react/test-utils`

## Next Steps

- [Getting Started](./getting-started.md) — Initial setup
- [API Reference](./api-reference.md) — Complete API reference
