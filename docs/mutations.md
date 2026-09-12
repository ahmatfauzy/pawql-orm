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
-- PostgreSQL / SQLite: RETURNING * included
INSERT INTO "users" ("id", "name", "email", "isActive") 
VALUES ($1, $2, $3, $4) RETURNING *
-- MySQL: RETURNING stripped automatically (MySQL does not support RETURNING)
-- INSERT INTO `users` (`id`, `name`, `email`, `isActive`) VALUES (?, ?, ?, ?)
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

> **Performance Note**: PawQL automatically implements **Chunked Insert Optimization** inside `.execute()`. You can pass an array block of hundreds of thousands of rows concurrently up to ~30,000 values, and PawQL will silently segment and loop them seamlessly to avoid the standard PostgreSQL max parameter limit `Out of Bounds` errors. Placeholder conversion (`$1` → `?` for MySQL/SQLite) is automatic.

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
-- PostgreSQL / SQLite
UPDATE "users" SET "name" = $1, "email" = $2 
WHERE "id" = $3 RETURNING *
-- MySQL: RETURNING stripped
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
-- PostgreSQL / SQLite
DELETE FROM "users" WHERE "id" = $1 RETURNING *
-- MySQL: RETURNING stripped
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

## Controllable RETURNING (PostgreSQL/SQLite — MySQL stripped)

By default, mutation operations (INSERT/UPDATE/DELETE) use `RETURNING *` on PostgreSQL/SQLite. On MySQL, `RETURNING` is automatically stripped (MySQL does not support `RETURNING`) — mutations return `rowCount` only. You can control this behavior:

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

## Upsert (ON CONFLICT — PostgreSQL/SQLite only)

PawQL supports `INSERT ... ON CONFLICT` for upsert operations on **PostgreSQL and SQLite**. On MySQL this throws `ON CONFLICT is not supported on MySQL — Use db.raw("INSERT ... ON DUPLICATE KEY UPDATE ...")`.

### DO NOTHING — Skip on Conflict

```typescript
await db.query('users')
  .insert({ id: 1, name: 'Alice', email: 'alice@example.com' })
  .onConflict('id')
  .doNothing()
  .returning(false)
  .execute();
```

**Generated SQL:**
```sql
INSERT INTO "users" ("id", "name", "email") VALUES ($1, $2, $3) 
ON CONFLICT ("id") DO NOTHING
```

### DO UPDATE — Update on Conflict

```typescript
await db.query('users')
  .insert({ id: 1, name: 'Alice', email: 'alice@example.com' })
  .onConflict('id')
  .doUpdate({ name: 'Alice Updated', email: 'new@example.com' })
  .execute();
```

**Generated SQL:**
```sql
INSERT INTO "users" ("id", "name", "email") VALUES ($1, $2, $3) 
ON CONFLICT ("id") DO UPDATE SET "name" = $4, "email" = $5 RETURNING *
```

### Multiple Conflict Columns

```typescript
await db.query('users')
  .insert({ id: 1, name: 'Alice', email: 'alice@example.com' })
  .onConflict('id', 'email')
  .doUpdate({ name: 'Alice Updated' })
  .execute();
// → ON CONFLICT ("id", "email") DO UPDATE SET "name" = ...
```

### With Controllable RETURNING

```typescript
const result = await db.query('users')
  .insert({ id: 1, name: 'Alice', email: 'alice@example.com' })
  .onConflict('id')
  .doUpdate({ name: 'Alice Updated' })
  .returning('id', 'name')
  .execute();
// Returns only id and name from the upserted row
```

## Next Steps

- [Transactions](./transactions.md) — Atomic operations
- [Querying](./querying.md) — SELECT, WHERE, ORDER BY
- [API Reference](./api-reference.md) — Complete API reference
