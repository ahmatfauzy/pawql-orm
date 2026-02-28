# Soft Delete

PawQL supports native **soft delete** — a pattern where records are marked as "deleted" by setting a timestamp column (e.g., `deleted_at`) instead of physically removing them from the database.

---

## Enabling Soft Delete

Enable soft delete when creating your database instance by specifying which tables support it:

```typescript
import { createDB, PostgresAdapter } from 'pawql';

const db = createDB({
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    email: { type: String, nullable: true },
    deleted_at: { type: Date, nullable: true },  // Required column
  },
  posts: {
    id: { type: Number, primaryKey: true },
    title: String,
    deleted_at: { type: Date, nullable: true },  // Required column
  },
  tags: {
    id: { type: Number, primaryKey: true },
    name: String,
    // No deleted_at — soft delete not needed here
  },
}, new PostgresAdapter({ connectionString: process.env.DATABASE_URL }), {
  softDelete: {
    tables: ['users', 'posts'],  // Tables with soft delete enabled
    column: 'deleted_at',         // Optional, this is the default
  },
});
```

> **Important:** The soft delete column (`deleted_at`) must be defined in your schema as `{ type: Date, nullable: true }`.

---

## Soft Deleting Records

Use `.softDelete()` to mark records as deleted by setting `deleted_at` to the current timestamp:

```typescript
// Soft delete a single user
await db.query('users')
  .where({ id: 1 })
  .softDelete()
  .execute();
// → UPDATE "users" SET "deleted_at" = $1 WHERE "id" = $2 AND "deleted_at" IS NULL

// Soft delete multiple users
await db.query('users')
  .where({ is_active: false })
  .softDelete()
  .execute();
```

> `.softDelete()` automatically adds `AND "deleted_at" IS NULL` to prevent re-deleting already soft-deleted rows.

---

## Querying (Default Behavior)

When soft delete is enabled, **all SELECT queries automatically exclude soft-deleted rows**:

```typescript
// Only returns users where deleted_at IS NULL
const users = await db.query('users').execute();

// WHERE conditions still work — soft delete filter is added automatically
const alice = await db.query('users')
  .where({ name: 'Alice' })
  .first();
// → SELECT * FROM "users" WHERE "name" = $1 AND "deleted_at" IS NULL LIMIT 1

// count() also respects soft delete
const activeCount = await db.query('users').count();
// → SELECT COUNT(*) FROM "users" WHERE "deleted_at" IS NULL
```

---

## Including Soft-Deleted Rows — `.withTrashed()`

Use `.withTrashed()` to include soft-deleted rows in your query:

```typescript
// Get ALL users, including soft-deleted ones
const allUsers = await db.query('users')
  .withTrashed()
  .execute();
// → SELECT * FROM "users"

// Count all users including deleted
const totalCount = await db.query('users')
  .withTrashed()
  .count();
```

---

## Only Soft-Deleted Rows — `.onlyTrashed()`

Use `.onlyTrashed()` to query **only** soft-deleted rows:

```typescript
// Get only soft-deleted users
const deletedUsers = await db.query('users')
  .onlyTrashed()
  .execute();
// → SELECT * FROM "users" WHERE "deleted_at" IS NOT NULL

// With additional filters
const recentlyDeleted = await db.query('users')
  .where({ name: { like: '%test%' } })
  .onlyTrashed()
  .execute();
// → SELECT * FROM "users" WHERE "name" LIKE $1 AND "deleted_at" IS NOT NULL
```

---

## Restoring Records — `.restore()`

Restore soft-deleted rows by setting `deleted_at` back to `NULL`:

```typescript
// Restore a specific user
await db.query('users')
  .where({ id: 1 })
  .restore()
  .execute();
// → UPDATE "users" SET "deleted_at" = $1 WHERE "id" = $2 AND "deleted_at" IS NOT NULL
//   (params: [null, 1])

// Restore all soft-deleted users
await db.query('users')
  .restore()
  .execute();
```

> `.restore()` automatically scopes the query to trashed rows (`deleted_at IS NOT NULL`).

---

## Hard Delete

You can still permanently delete rows using the standard `.delete()` method:

```typescript
// Permanently remove from database
await db.query('users')
  .delete()
  .where({ id: 1 })
  .execute();
// → DELETE FROM "users" WHERE "id" = $1
```

---

## Custom Column Name

By default, PawQL uses `deleted_at` as the soft delete column. You can customize this:

```typescript
const db = createDB(schema, adapter, {
  softDelete: {
    tables: ['users'],
    column: 'removed_at',  // Use a custom column name
  },
});
```

---

## Transactions

Soft delete configuration is automatically preserved within transactions:

```typescript
await db.transaction(async (tx) => {
  // Soft delete works inside transactions
  await tx.query('users')
    .where({ id: 1 })
    .softDelete()
    .execute();

  await tx.query('users')
    .where({ id: 2 })
    .softDelete()
    .execute();
});
```

---

## Per-Table Configuration

Soft delete only affects tables listed in the `tables` array. Other tables behave normally:

```typescript
const db = createDB(schema, adapter, {
  softDelete: {
    tables: ['users', 'posts'],  // Only these tables use soft delete
  },
});

// Soft-delete-enabled: auto-filters deleted rows
await db.query('users').execute();
// → SELECT * FROM "users" WHERE "deleted_at" IS NULL

// Not enabled: normal behavior
await db.query('tags').execute();
// → SELECT * FROM "tags"
```

---

## Error Handling

Calling `.softDelete()` or `.restore()` on a table without soft delete enabled will throw a descriptive error:

```typescript
const db = createDB(schema, adapter);  // No soft delete config

await db.query('users').softDelete().execute();
// ❌ Error: Soft delete is not enabled for table "users".
//    Enable it via createDB(schema, adapter, { softDelete: { tables: ['users'] } })
```

---

## API Summary

| Method | Description | SQL Generated |
|--------|-------------|---------------|
| `.softDelete()` | Set `deleted_at = NOW()` | `UPDATE ... SET "deleted_at" = $1` |
| `.restore()` | Set `deleted_at = NULL` | `UPDATE ... SET "deleted_at" = $1` (null) |
| `.withTrashed()` | Include deleted rows | Removes `deleted_at` filter |
| `.onlyTrashed()` | Only deleted rows | `WHERE "deleted_at" IS NOT NULL` |
| `.delete()` | Hard delete (permanent) | `DELETE FROM ...` |
| *default query* | Exclude deleted rows | `WHERE "deleted_at" IS NULL` |
