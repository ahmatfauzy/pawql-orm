# API Reference

Complete reference for all classes, methods, and types available in PawQL.

---

## `createDB(schema, adapter)`

Factory function to create a new database instance.

```typescript
function createDB<TSchema extends DatabaseSchema>(
  schema: TSchema,
  adapter: DatabaseAdapter
): Database<TSchema>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `schema` | `DatabaseSchema` | Schema definition (table objects) |
| `adapter` | `DatabaseAdapter` | Database adapter (PostgresAdapter, DummyAdapter) |

**Returns:** `Database<TSchema>`

**Example:**
```typescript
import { createDB, PostgresAdapter } from 'pawql';

const db = createDB({
  users: { id: Number, name: String }
}, new PostgresAdapter({ connectionString: '...' }));
```

---

## `Database<TSchema>`

The main class for interacting with the database.

### `db.query(tableName)`

Start a query builder for a specific table.

```typescript
query<K extends keyof TSchema>(tableName: K): QueryBuilder<...>
```

**Returns:** `QueryBuilder` instance

### `db.createTables()`

Create all tables from the schema (DDL).

```typescript
createTables(): Promise<void>
```

### `db.transaction(callback)`

Run a callback within a database transaction.

```typescript
transaction<T>(callback: (tx: Database<TSchema>) => Promise<T>): Promise<T>
```

### `db.close()`

Close the database connection.

```typescript
close(): Promise<void>
```

### `db.schema`

Access the defined schema.

```typescript
get schema(): TSchema
```

---

## `QueryBuilder`

A type-safe query builder. Created via `db.query('tableName')`.

### CRUD Methods

#### `.insert(data)`

```typescript
insert(data: Partial<TTable> | Partial<TTable>[]): this
```

Insert data. Accepts a single object or an array for batch inserts.

#### `.update(data)`

```typescript
update(data: Partial<TTable>): this
```

Update data. Typically used with `.where()`.

#### `.delete()`

```typescript
delete(): this
```

Delete data. Typically used with `.where()`.

### Selection

#### `.select(...columns)`

```typescript
select(...columns: string[]): QueryBuilder
```

Select specific columns. Without `.select()`, defaults to `SELECT *`.

```typescript
db.query('users').select('id', 'name')
// → SELECT "id", "name" FROM "users"
```

### Filtering

#### `.where(conditions)`

```typescript
where(conditions: WhereCondition<TTable>): this
```

Add a WHERE condition (AND).

**WhereCondition syntax:**

```typescript
// Equality
.where({ name: 'Alice' })

// Comparison operators
.where({ age: { gt: 18 } })       // >
.where({ age: { lt: 100 } })      // <
.where({ age: { gte: 18 } })      // >=
.where({ age: { lte: 60 } })      // <=
.where({ name: { not: 'Alice' }}) // !=

// Set operators
.where({ role: { in: ['admin', 'user'] } })
.where({ role: { notIn: ['banned'] } })

// Pattern matching
.where({ name: { like: '%Alice%' } })
.where({ name: { ilike: '%alice%' } })

// Range
.where({ age: { between: [18, 60] } })

// Null check
.where({ deletedAt: null })
```

#### `.orWhere(conditions)`

```typescript
orWhere(conditions: WhereCondition<TTable>): this
```

Add a WHERE condition with OR.

### Sorting

#### `.orderBy(column, direction?)`

```typescript
orderBy(column: string, direction?: 'ASC' | 'DESC'): this
```

Sort results. Default direction: `'ASC'`. Can be called multiple times for multiple columns.

```typescript
db.query('users')
  .orderBy('name', 'ASC')
  .orderBy('createdAt', 'DESC')
```

### Pagination

#### `.limit(n)`

```typescript
limit(n: number): this
```

Limit the number of results.

#### `.offset(n)`

```typescript
offset(n: number): this
```

Skip a number of rows (for pagination).

### Joins

#### `.innerJoin(table, col1, op, col2)`

```typescript
innerJoin<K extends keyof TSchema>(
  table: K, col1: string, operator: string, col2: string
): QueryBuilder<TTable, TResult & InferTableType<TSchema[K]>, TSchema>
```

#### `.leftJoin(table, col1, op, col2)`

```typescript
leftJoin<K extends keyof TSchema>(
  table: K, col1: string, operator: string, col2: string
): QueryBuilder<TTable, TResult & Partial<InferTableType<TSchema[K]>>, TSchema>
```

#### `.rightJoin(table, col1, op, col2)`

Same signature as `leftJoin`.

#### `.fullJoin(table, col1, op, col2)`

Same signature as `leftJoin`.

### RETURNING

#### `.returning(...columns)` / `.returning(false)`

```typescript
returning(...columns: string[]): this  // Specific columns
returning(false): this                  // Disable RETURNING
```

Control the RETURNING clause for INSERT/UPDATE/DELETE.

```typescript
// Default: RETURNING *
db.query('users').insert({ ... })

// Specific columns
db.query('users').insert({ ... }).returning('id', 'name')

// Disable
db.query('users').insert({ ... }).returning(false)
```

### Execution

#### `.execute()`

```typescript
execute(): Promise<TResult[]>
```

Execute the query and return an array of results.

#### `.first()`

```typescript
first(): Promise<TResult | null>
```

Execute the query with `LIMIT 1` and return a single object or `null`.

#### `.count()`

```typescript
count(): Promise<number>
```

Execute a `SELECT COUNT(*)` query and return the row count.

#### `.toSQL()`

```typescript
toSQL(): { sql: string; values: any[] }
```

Return the SQL and parameters without executing the query. Useful for debugging.

```typescript
const { sql, values } = db.query('users')
  .where({ id: 1 })
  .toSQL();

console.log(sql);    // SELECT * FROM "users" WHERE "id" = $1
console.log(values); // [1]
```

---

## `PostgresAdapter`

Adapter for PostgreSQL using the `pg` library.

```typescript
import { PostgresAdapter } from 'pawql';

const adapter = new PostgresAdapter({
  connectionString: 'postgresql://user:pass@host:5432/db',
  // or
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'secret',
  max: 20,
  idleTimeoutMillis: 30000,
});
```

### Methods

#### `adapter.query(sql, params)`

```typescript
query<T>(sql: string, params?: any[]): Promise<QueryResult<T>>
```

#### `adapter.transaction(callback)`

```typescript
transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T>
```

#### `adapter.close()`

```typescript
close(): Promise<void>
```

---

## `DummyAdapter`

A test adapter that records all queries. Import from `pawql/testing`.

```typescript
import { DummyAdapter } from 'pawql/testing';
```

### Properties

#### `adapter.logs`

```typescript
logs: { sql: string; params: any[] }[]
```

An array containing all executed queries.

---

## Schema Types

### Helpers

```typescript
import { uuid, json, enumType, arrayType } from 'pawql';
```

| Helper | Example | PostgreSQL | TypeScript |
|--------|---------|------------|------------|
| `uuid` | `id: uuid` | `UUID` | `string` |
| `json<T>()` | `meta: json<{a:string}>()` | `JSONB` | `T` |
| `enumType(...values)` | `role: enumType('a','b')` | `TEXT + CHECK` | `'a' \| 'b'` |
| `arrayType(Type)` | `tags: arrayType(String)` | `TEXT[]` | `string[]` |

### Column Definition

```typescript
interface ColumnDefinition {
  type: ColumnTypeValue;   // Number, String, Boolean, Date, uuid, json, enum, array
  nullable?: boolean;      // Default: false
  primaryKey?: boolean;    // Default: false
  default?: any;           // Default value
}
```

---

## `DatabaseAdapter` Interface

To create a custom adapter:

```typescript
interface DatabaseAdapter {
  query<T>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}
```
