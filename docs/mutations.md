# Mutations (INSERT, UPDATE, DELETE)

A complete guide to modifying data in the database using PawQL.

## INSERT

### Insert a Single Row

```typescript
const newUser = await db.query('users')
  .insert({ 
    id: 1, 
    name: 'Alice', 
    email: 'alice@example.com',
    isActive: true 
  })
  .execute();
```

**Generated SQL:**
```sql
INSERT INTO "users" ("id", "name", "email", "isActive") 
VALUES ($1, $2, $3, $4) RETURNING *
```

### Insert Multiple Rows (Batch)

```typescript
const newUsers = await db.query('users')
  .insert([
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com' },
  ])
  .execute();
```

**Generated SQL:**
```sql
INSERT INTO "users" ("id", "name", "email") 
VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9) RETURNING *
```

## UPDATE

### Update with WHERE

```typescript
const updated = await db.query('users')
  .update({ name: 'Bob Smith', email: 'bob.smith@example.com' })
  .where({ id: 1 })
  .execute();
```

**Generated SQL:**
```sql
UPDATE "users" SET "name" = $1, "email" = $2 
WHERE "id" = $3 RETURNING *
```

### Update Multiple Rows

```typescript
const deactivated = await db.query('users')
  .update({ isActive: false })
  .where({ role: 'guest' })
  .execute();
// Deactivates all guest users
```

## DELETE

### Delete with WHERE

```typescript
const deleted = await db.query('users')
  .delete()
  .where({ id: 1 })
  .execute();
```

**Generated SQL:**
```sql
DELETE FROM "users" WHERE "id" = $1 RETURNING *
```

### Delete Multiple Rows

```typescript
await db.query('users')
  .delete()
  .where({ isActive: false })
  .execute();
// Deletes all inactive users
```

> ⚠️ **Warning**: Without `.where()`, DELETE will remove **all rows** in the table!

## Controllable RETURNING

By default, mutation operations (INSERT/UPDATE/DELETE) use `RETURNING *`. You can control this behavior:

### Default: RETURNING *

```typescript
const user = await db.query('users')
  .insert({ id: 1, name: 'Alice' })
  .execute();
// → INSERT INTO ... RETURNING *
// Returns: all columns from the newly inserted row
```

### Specific Columns

```typescript
const user = await db.query('users')
  .insert({ id: 1, name: 'Alice', email: 'alice@example.com' })
  .returning('id', 'name')
  .execute();
// → INSERT INTO ... RETURNING "id", "name"
// Returns: only id and name
```

### Disable RETURNING

```typescript
await db.query('users')
  .insert({ id: 1, name: 'Alice' })
  .returning(false)
  .execute();
// → INSERT INTO ... (no RETURNING clause)
// Returns: [] (empty array)
```

### RETURNING with UPDATE

```typescript
const updated = await db.query('users')
  .update({ name: 'Bob' })
  .where({ id: 1 })
  .returning('id', 'name')
  .execute();
// → UPDATE ... SET ... WHERE ... RETURNING "id", "name"
```

### RETURNING with DELETE

```typescript
const deleted = await db.query('users')
  .delete()
  .where({ isActive: false })
  .returning('id')
  .execute();
// → DELETE FROM ... WHERE ... RETURNING "id"
// Useful for logging which rows were deleted
```

## Pattern: Insert and Get ID

```typescript
// Insert and get only the ID back
const [result] = await db.query('users')
  .insert({ name: 'Alice', email: 'alice@example.com' })
  .returning('id')
  .execute();

console.log(`Created user with ID: ${result.id}`);
```

## Pattern: Manual Upsert

PawQL doesn't have a built-in upsert yet, but you can use a transaction:

```typescript
await db.transaction(async (tx) => {
  const existing = await tx.query('users')
    .where({ email: 'alice@example.com' })
    .first();

  if (existing) {
    await tx.query('users')
      .update({ name: 'Alice Updated' })
      .where({ id: existing.id })
      .execute();
  } else {
    await tx.query('users')
      .insert({ name: 'Alice', email: 'alice@example.com' })
      .execute();
  }
});
```

## Next Steps

- [Transactions](./transactions.md) — Atomic operations
- [Querying](./querying.md) — SELECT, WHERE, ORDER BY
- [API Reference](./api-reference.md) — Complete API reference
