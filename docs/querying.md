# Querying Data

A complete guide to retrieving data from the database using PawQL.

## Basic Select

```typescript
// Select all columns
const users = await db.query('users').execute();

// Select specific columns
const names = await db.query('users')
  .select('id', 'name')
  .execute();
```

## WHERE Clause

### Exact Match (Equality)

```typescript
const alice = await db.query('users')
  .where({ name: 'Alice' })
  .execute();
// → WHERE "name" = $1
```

### Multiple Conditions (AND)

```typescript
const result = await db.query('users')
  .where({ role: 'admin', isActive: true })
  .execute();
// → WHERE "role" = $1 AND "isActive" = $2
```

### OR Conditions

```typescript
const result = await db.query('users')
  .where({ name: 'Alice' })
  .orWhere({ name: 'Bob' })
  .execute();
// → WHERE "name" = $1 OR "name" = $2
```

### Comparison Operators

```typescript
const result = await db.query('users')
  .where({
    age: { gt: 18 },      // > 18
  })
  .execute();
// → WHERE "age" > $1
```

**Available operators:**

| Syntax | SQL | Description |
|--------|-----|-------------|
| `{ gt: value }` | `>` | Greater than |
| `{ lt: value }` | `<` | Less than |
| `{ gte: value }` | `>=` | Greater than or equal |
| `{ lte: value }` | `<=` | Less than or equal |
| `{ not: value }` | `!=` | Not equal |

### Combining Comparisons

```typescript
const result = await db.query('users')
  .where({ age: { gt: 18, lte: 60 } })
  .execute();
// → WHERE "age" > $1 AND "age" <= $2
```

### IN Operator

```typescript
const result = await db.query('users')
  .where({ status: { in: ['active', 'pending'] } })
  .execute();
// → WHERE "status" IN ($1, $2)
```

### NOT IN Operator

```typescript
const result = await db.query('users')
  .where({ role: { notIn: ['banned', 'suspended'] } })
  .execute();
// → WHERE "role" NOT IN ($1, $2)
```

### LIKE / ILIKE

```typescript
// Case-sensitive pattern matching
const result = await db.query('users')
  .where({ name: { like: '%Alice%' } })
  .execute();
// → WHERE "name" LIKE $1

// Case-insensitive (PostgreSQL)
const result2 = await db.query('users')
  .where({ name: { ilike: '%alice%' } })
  .execute();
// → WHERE "name" ILIKE $1
```

### BETWEEN

```typescript
const result = await db.query('users')
  .where({ age: { between: [18, 60] } })
  .execute();
// → WHERE "age" BETWEEN $1 AND $2
```

### IS NULL

```typescript
const result = await db.query('users')
  .where({ deletedAt: null })
  .execute();
// → WHERE "deletedAt" IS NULL
```

## ORDER BY

Sort query results by one or more columns.

```typescript
// Single column, ascending (default)
const result = await db.query('users')
  .orderBy('name')
  .execute();
// → ORDER BY "name" ASC

// Single column, descending
const result2 = await db.query('users')
  .orderBy('createdAt', 'DESC')
  .execute();
// → ORDER BY "createdAt" DESC

// Multiple columns
const result3 = await db.query('users')
  .orderBy('role', 'ASC')
  .orderBy('name', 'ASC')
  .execute();
// → ORDER BY "role" ASC, "name" ASC
```

## LIMIT & OFFSET

```typescript
// Get the first 10 users
const page1 = await db.query('users')
  .orderBy('id', 'ASC')
  .limit(10)
  .execute();

// Page 2 (skip 10, take 10)
const page2 = await db.query('users')
  .orderBy('id', 'ASC')
  .limit(10)
  .offset(10)
  .execute();
```

## `.first()` — Single Row

Retrieve a single row. Returns `T | null` instead of an array.

```typescript
const user = await db.query('users')
  .where({ id: 1 })
  .first();

if (user) {
  console.log(user.name); // Fully typed!
} else {
  console.log('User not found');
}
```

> Internally, `.first()` adds `LIMIT 1` and unwraps the array into a single object.

## `.count()` — Count Rows

Count the number of matching rows. Returns `number`.

```typescript
// Total users
const totalUsers = await db.query('users').count();

// Active users only
const activeCount = await db.query('users')
  .where({ isActive: true })
  .count();

console.log(`${activeCount} of ${totalUsers} users are active`);
```

> Generates `SELECT COUNT(*) FROM "users" WHERE ...`

## Joins

### Inner Join

```typescript
const userPosts = await db.query('users')
  .innerJoin('posts', 'users.id', '=', 'posts.userId')
  .select('users.name', 'posts.title')
  .execute();
// Type: { name: string; title: string }[]
```

### Left Join

```typescript
const usersWithPosts = await db.query('users')
  .leftJoin('posts', 'users.id', '=', 'posts.userId')
  .execute();
// Left join: columns from posts can be null
```

### Right Join

```typescript
const postsWithUsers = await db.query('posts')
  .rightJoin('users', 'posts.userId', '=', 'users.id')
  .execute();
```

### Full Join

```typescript
const all = await db.query('users')
  .fullJoin('posts', 'users.id', '=', 'posts.userId')
  .execute();
```

### Multiple Joins

```typescript
const result = await db.query('users')
  .innerJoin('posts', 'users.id', '=', 'posts.userId')
  .leftJoin('comments', 'posts.id', '=', 'comments.postId')
  .select('users.name', 'posts.title', 'comments.text')
  .execute();
```

### Joins with WHERE

```typescript
const result = await db.query('users')
  .innerJoin('posts', 'users.id', '=', 'posts.userId')
  .where({ 'users.isActive': true })
  .orderBy('posts.title', 'ASC')
  .limit(20)
  .execute();
```

## Combining Everything

A complex query example combining all features:

```typescript
const results = await db.query('users')
  .innerJoin('posts', 'users.id', '=', 'posts.userId')
  .select('users.name', 'posts.title')
  .where({ 
    'users.isActive': true,
    'users.age': { between: [18, 65] }
  })
  .orWhere({ 'users.role': 'admin' })
  .orderBy('users.name', 'ASC')
  .orderBy('posts.title', 'DESC')
  .limit(50)
  .offset(0)
  .execute();
```

**Generated SQL:**
```sql
SELECT "users"."name", "posts"."title" 
FROM "users" 
INNER JOIN "posts" ON "users"."id" = "posts"."userId"
WHERE "users"."isActive" = $1 
  AND "users"."age" BETWEEN $2 AND $3 
  OR "users"."role" = $4
ORDER BY "users"."name" ASC, "posts"."title" DESC
LIMIT 50 OFFSET 0
```

## GROUP BY

Group rows by one or more columns, typically used with aggregate functions.

```typescript
// Count orders per user
const orderCounts = await db.query('orders')
  .select('userId')
  .groupBy('userId')
  .execute();
// → SELECT "userId" FROM "orders" GROUP BY "userId"

// Multiple group columns
const statusByUser = await db.query('orders')
  .select('userId', 'status')
  .groupBy('userId', 'status')
  .execute();
// → SELECT "userId", "status" FROM "orders" GROUP BY "userId", "status"
```

### HAVING

Filter groups after aggregation. Use `$1`, `$2`, etc. for parameterized values.

```typescript
// Users with more than 5 orders
const frequentBuyers = await db.query('orders')
  .select('userId')
  .groupBy('userId')
  .having('COUNT(*) > $1', 5)
  .execute();
// → SELECT "userId" FROM "orders" GROUP BY "userId" HAVING COUNT(*) > $1

// Combine WHERE + GROUP BY + HAVING
const bigSpenders = await db.query('orders')
  .select('userId')
  .where({ status: 'completed' })
  .groupBy('userId')
  .having('SUM(total) > $1', 1000)
  .execute();
// → WHERE "status" = $1 GROUP BY "userId" HAVING SUM(total) > $2

// Multiple HAVING conditions (combined with AND)
const topUsers = await db.query('orders')
  .select('userId')
  .groupBy('userId')
  .having('COUNT(*) > $1', 2)
  .having('SUM(total) > $1', 500)
  .execute();
// → HAVING COUNT(*) > $1 AND SUM(total) > $2
```

## Subqueries

PawQL supports subqueries in both WHERE and FROM clauses via the `subquery()` helper.

```typescript
import { subquery } from 'pawql';
```

### Subquery in WHERE (IN)

```typescript
// Find users who have completed orders
const completedOrderUserIds = db.query('orders')
  .select('userId')
  .where({ status: 'completed' });

const users = await db.query('users')
  .where({ id: { subquery: subquery(completedOrderUserIds) } })
  .execute();
// → SELECT * FROM "users" WHERE "id" IN (SELECT "userId" FROM "orders" WHERE "status" = $1)
```

### Subquery in FROM

```typescript
// Query from a derived table
const expensiveOrders = db.query('orders')
  .where({ total: { gt: 500 } });

const result = await db.query('orders')
  .select('userId')
  .from(subquery(expensiveOrders).as('expensive'))
  .execute();
// → SELECT "userId" FROM (SELECT * FROM "orders" WHERE "total" > $1) AS "expensive"
```

> Parameters from inner and outer queries are properly rebased — no conflicts.

## Raw SQL — Escape Hatch

When the query builder doesn't cover your use case, use `db.raw()` to execute any SQL directly:

```typescript
// Custom query with parameters
const result = await db.raw<{ id: number; name: string }>(
  'SELECT * FROM users WHERE age > $1 ORDER BY name',
  [18]
);
console.log(result.rows);     // [{ id: 1, name: 'Alice' }, ...]
console.log(result.rowCount); // number of rows

// DDL operations (indexes, etc.)
await db.raw('CREATE INDEX idx_users_email ON users(email)');

// Complex queries not supported by the builder
await db.raw(`
  SELECT u.name, COUNT(p.id) AS post_count
  FROM users u
  LEFT JOIN posts p ON u.id = p.user_id
  GROUP BY u.name
  HAVING COUNT(p.id) > $1
`, [5]);
```

> `db.raw()` also works inside transactions via `tx.raw()`.

## Next Steps

- [Mutations](./mutations.md) — INSERT, UPDATE, DELETE
- [Transactions](./transactions.md) — Atomic operations
- [API Reference](./api-reference.md) — Complete API reference
