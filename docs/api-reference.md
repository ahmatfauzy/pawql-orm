# API Reference

Complete reference for all classes, methods, and types available in PawQL.

---

## `createDB(schema, adapter)`

Factory function to create a new database instance.

```typescript
function createDB<TSchema extends DatabaseSchema>(
  schema: TSchema,
  adapter: DatabaseAdapter,
  options?: DatabaseOptions
): Database<TSchema>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `schema` | `DatabaseSchema` | Schema definition (table objects) |
| `adapter` | `DatabaseAdapter` | Database adapter (PostgresAdapter, DummyAdapter) |
| `options` | `DatabaseOptions` | Optional config (logger, etc.) |

**Returns:** `Database<TSchema>`

**Example:**
```typescript
import { createDB, PostgresAdapter, consoleLogger } from 'pawql';

const db = createDB({
  users: { id: Number, name: String }
}, new PostgresAdapter({ connectionString: '...' }), {
  logger: consoleLogger,  // Optional: log all SQL queries
});
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

### `db.raw(sql, params?)`

Execute a raw SQL query with parameterized values. This is the escape hatch for custom SQL that the query builder doesn't support.

```typescript
raw<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `sql` | `string` | SQL query string (use `$1`, `$2`, etc. for params) |
| `params` | `any[]` | Optional parameter values |

**Returns:** `QueryResult<T>` with `rows: T[]` and `rowCount: number`

**Examples:**
```typescript
// Simple query
const result = await db.raw<{ now: Date }>('SELECT NOW() AS now');

// With parameters
const users = await db.raw<{ id: number; name: string }>(
  'SELECT * FROM users WHERE age > $1 ORDER BY name',
  [18]
);
console.log(users.rows);

// DDL operations
await db.raw('CREATE INDEX idx_users_email ON users(email)');

// Works inside transactions
await db.transaction(async (tx) => {
  await tx.raw('INSERT INTO logs (message) VALUES ($1)', ['action performed']);
});
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

### Aggregation

#### `.groupBy(...columns)`

```typescript
groupBy(...columns: string[]): this
```

Group results by one or more columns.

#### `.having(condition, ...params)`

```typescript
having(condition: string, ...params: any[]): this
```

Filter groups after aggregation. Use `$1`, `$2`, etc. for parameterized values. Can be chained multiple times (combined with AND).

```typescript
db.query('orders')
  .select('userId')
  .groupBy('userId')
  .having('COUNT(*) > $1', 5)
  .having('SUM(total) > $1', 1000)
```

### Upsert (ON CONFLICT)

#### `.onConflict(...columns)`

```typescript
onConflict(...columns: string[]): {
  doUpdate: (data: Partial<TTable>) => QueryBuilder;
  doNothing: () => QueryBuilder;
}
```

Specify conflict columns for upsert. Chain with `.doUpdate(data)` or `.doNothing()`.

```typescript
// Skip duplicates
db.query('users')
  .insert({ id: 1, name: 'Alice' })
  .onConflict('id').doNothing()

// Update on conflict
db.query('users')
  .insert({ id: 1, name: 'Alice' })
  .onConflict('id').doUpdate({ name: 'Alice Updated' })
```

### Subqueries

#### `subquery(builder)`

```typescript
import { subquery } from 'pawql';

subquery(builder): SubqueryDef & { as(alias: string): SubqueryDef }
```

Create a subquery from a query builder. Use `.as(alias)` for FROM subqueries.

#### `.from(subquery)`

```typescript
from(sub: SubqueryDef): this
```

Use a subquery as the FROM source.

```typescript
const sub = db.query('orders').where({ total: { gt: 100 } });
db.query('orders')
  .select('userId')
  .from(subquery(sub).as('expensive'))
```

#### Subquery in WHERE

```typescript
const orderUserIds = db.query('orders').select('userId');
db.query('users')
  .where({ id: { subquery: subquery(orderUserIds) } })
// → WHERE "id" IN (SELECT "userId" FROM "orders")
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

### Soft Delete

#### `.softDelete()`

```typescript
softDelete(): this
```

Set the `deleted_at` column to the current timestamp (soft delete). Only works when soft delete is enabled.

```typescript
await db.query('users').where({ id: 1 }).softDelete().execute();
// → UPDATE "users" SET "deleted_at" = $1 WHERE "id" = $2 AND "deleted_at" IS NULL
```

#### `.restore()`

```typescript
restore(): this
```

Set `deleted_at` to NULL to restore soft-deleted rows. Automatically scopes to trashed rows.

```typescript
await db.query('users').where({ id: 1 }).restore().execute();
// → UPDATE "users" SET "deleted_at" = $1 WHERE "id" = $2 AND "deleted_at" IS NOT NULL
```

#### `.withTrashed()`

```typescript
withTrashed(): this
```

Include soft-deleted rows in query results. By default, soft-deleted rows are excluded.

```typescript
const allUsers = await db.query('users').withTrashed().execute();
// → SELECT * FROM "users" (no deleted_at filter)
```

#### `.onlyTrashed()`

```typescript
onlyTrashed(): this
```

Only return soft-deleted rows.

```typescript
const deletedUsers = await db.query('users').onlyTrashed().execute();
// → SELECT * FROM "users" WHERE "deleted_at" IS NOT NULL
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

## `Migrator`

The migration manager class. Import from `pawql` or `pawql/migration`.

```typescript
import { Migrator, PostgresAdapter } from 'pawql';

const migrator = new Migrator(adapter, {
  directory: './migrations',
  tableName: 'pawql_migrations',
});
```

### `migrator.up()`

```typescript
up(): Promise<string[]>
```

Run all pending migrations. Returns an array of applied migration names.

### `migrator.down()`

```typescript
down(): Promise<string[]>
```

Rollback the last batch of migrations. Returns an array of rolled-back migration names.

### `migrator.make(name)`

```typescript
make(name: string): string
```

Create a new migration file with a timestamp prefix. Returns the file path.

### `migrator.getPending()`

```typescript
getPending(): Promise<string[]>
```

Get a list of migration names that haven't been applied yet.

### `migrator.getExecuted()`

```typescript
getExecuted(): Promise<MigrationRecord[]>
```

Get all executed migration records from the tracking table.

### `migrator.listMigrationFiles()`

```typescript
listMigrationFiles(): string[]
```

List all migration files in the configured directory (sorted, without extensions).

---

## `MigrationRunner`

Passed to migration `up()` and `down()` functions. Provides DDL helpers.

### `runner.createTable(tableName, columns)`

```typescript
createTable(tableName: string, columns: Record<string, any>): Promise<void>
```

Create a table using PawQL runtime schema types.

### `runner.dropTable(tableName)`

```typescript
dropTable(tableName: string): Promise<void>
```

Drop a table with `CASCADE`.

### `runner.addColumn(tableName, columnName, definition)`

```typescript
addColumn(tableName: string, columnName: string, definition: any): Promise<void>
```

Add a column to an existing table.

### `runner.dropColumn(tableName, columnName)`

```typescript
dropColumn(tableName: string, columnName: string): Promise<void>
```

Remove a column from a table.

### `runner.renameTable(oldName, newName)`

```typescript
renameTable(oldName: string, newName: string): Promise<void>
```

Rename a table.

### `runner.renameColumn(tableName, oldName, newName)`

```typescript
renameColumn(tableName: string, oldName: string, newName: string): Promise<void>
```

Rename a column in a table.

### `runner.sql(query, params?)`

```typescript
sql(query: string, params?: any[]): Promise<void>
```

Execute a raw SQL statement.

---

## `MigrationConfig`

```typescript
interface MigrationConfig {
  directory?: string;   // Default: './migrations'
  tableName?: string;   // Default: 'pawql_migrations'
}
```

## `MigrationRecord`

```typescript
interface MigrationRecord {
  id: number;
  name: string;
  batch: number;
  executed_at: Date;
}
```

## `Migration`

The interface for migration files:

```typescript
interface Migration {
  up(runner: MigrationRunner): Promise<void>;
  down(runner: MigrationRunner): Promise<void>;
}
```

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

---

## Logger / Debug Mode

PawQL includes a pluggable logging system to inspect all generated SQL queries.

### `PawQLLogger` Interface

```typescript
interface PawQLLogger {
  query(sql: string, params: any[] | undefined, durationMs: number): void;
}
```

### `consoleLogger`

Built-in logger with colored terminal output. Shows query time, SQL, and parameters.

```typescript
import { createDB, consoleLogger } from 'pawql';

const db = createDB(schema, adapter, { logger: consoleLogger });
// Output: [0.3ms] SELECT * FROM "users" WHERE "id" = $1 [1]
```

### `silentLogger`

A no-op logger that discards all output. Useful for disabling logging in production.

```typescript
import { silentLogger } from 'pawql';
const db = createDB(schema, adapter, { logger: silentLogger });
```

### Custom Logger

```typescript
const db = createDB(schema, adapter, {
  logger: {
    query(sql, params, durationMs) {
      // Send to your logging service
      myLogger.info({ sql, params, durationMs });
    }
  }
});
```

### `DatabaseOptions`

```typescript
interface DatabaseOptions {
  logger?: PawQLLogger;  // Optional query logger
  softDelete?: {
    tables: string[];    // Tables with soft delete enabled
    column?: string;     // Column name (default: 'deleted_at')
  };
}
```

---

## Pool Management

### `PawQLPoolConfig`

Extends `pg.PoolConfig` with documented pool options:

```typescript
interface PawQLPoolConfig extends PoolConfig {
  max?: number;                    // Max pool size (default: 10)
  idleTimeoutMillis?: number;      // Idle timeout (default: 10000ms)
  connectionTimeoutMillis?: number; // Connection timeout (default: 0)
  statement_timeout?: number;      // Query timeout
  allowExitOnIdle?: boolean;       // Allow exceeding max (default: false)
}
```

### `PostgresAdapter` Constructor

```typescript
new PostgresAdapter(config: PawQLPoolConfig)   // Create new pool
new PostgresAdapter(pool: Pool)                // Use existing pool
new PostgresAdapter(client: PoolClient)        // Transaction client
```

### Pool Statistics

```typescript
const adapter = new PostgresAdapter({ connectionString: '...', max: 20 });

adapter.poolSize      // Total clients in the pool
adapter.idleCount     // Idle clients
adapter.waitingCount  // Clients waiting for a connection
```

**Example:**
```typescript
import { PostgresAdapter } from 'pawql';

const adapter = new PostgresAdapter({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

---

## Parameter Validation

PawQL includes built-in runtime validation for checking input data against schema types.

### `validateRow(data, schema, options?)`

Validate a single row against a table schema. Returns a result object (does not throw).

```typescript
import { validateRow } from 'pawql';

function validateRow(
  data: Record<string, unknown>,
  tableSchema: TableSchema,
  options?: ValidateOptions
): ValidationResult
```

**Returns:** `ValidationResult`

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  column: string;       // Column name
  message: string;      // Human-readable error
  value: unknown;       // Provided value
  expectedType: string; // Expected type name
}
```

**Example:**
```typescript
const result = validateRow({ id: 'wrong', name: 123 }, schema.users);
// result.valid === false
// result.errors === [
//   { column: 'id', message: 'Expected a number, got string', ... },
//   { column: 'name', message: 'Expected a string, got number', ... },
// ]
```

### `assertValid(data, schema, tableName, options?)`

Validate and throw `PawQLValidationError` if any errors are found. Accepts a single row or array of rows.

```typescript
import { assertValid } from 'pawql';

function assertValid(
  data: Record<string, unknown> | Record<string, unknown>[],
  tableSchema: TableSchema,
  tableName: string,
  options?: ValidateOptions
): void
```

### `PawQLValidationError`

Custom error class thrown by `assertValid()`.

```typescript
class PawQLValidationError extends Error {
  readonly table: string;
  readonly details: { row: number; errors: ValidationError[] }[];
}
```

### `ValidateOptions`

```typescript
interface ValidateOptions {
  partial?: boolean;       // Allow missing columns (default: false)
  skipDefaults?: boolean;  // Skip columns with defaults (default: true)
  skipPrimaryKey?: boolean; // Skip primary key columns (default: false)
}
```

See [Parameter Validation Guide](./validation.md) for detailed usage.

---

## Seeders

PawQL provides a declarative way to populate databases with initial or test data.

### `seed(db, data, options?)`

Seed the database with data. Validates against schema, wraps in transaction, and returns a result.

```typescript
import { seed } from 'pawql';

function seed<TSchema extends DatabaseSchema>(
  db: Database<TSchema>,
  data: SeedData<TSchema>,
  options?: SeederOptions
): Promise<SeedResult>
```

**Returns:** `SeedResult`

```typescript
interface SeedResult {
  totalRows: number;
  tables: { name: string; rows: number }[];
}
```

**Example:**
```typescript
const result = await seed(db, {
  users: [
    { id: 1, name: 'Alice', age: 28 },
    { id: 2, name: 'Bob', age: 32 },
  ],
}, { truncate: true, validate: true });

console.log(result.totalRows); // 2
```

### `createSeeder(db, defaultOptions?)`

Create a reusable seeder function with default options.

```typescript
import { createSeeder } from 'pawql';

function createSeeder<TSchema extends DatabaseSchema>(
  db: Database<TSchema>,
  defaultOptions?: SeederOptions
): (data: SeedData<TSchema>, options?: SeederOptions) => Promise<SeedResult>
```

**Example:**
```typescript
const seeder = createSeeder(db, { validate: true, transaction: true });
await seeder({ users: [...] });
```

### `SeederOptions`

```typescript
interface SeederOptions {
  truncate?: boolean;            // Delete rows first (default: false)
  validate?: boolean;            // Validate against schema (default: true)
  validateOptions?: ValidateOptions; // Validator options
  transaction?: boolean;         // Wrap in transaction (default: true)
  onSeed?: (tableName: string, rowCount: number) => void; // Progress callback
}
```

### `SeedData<TSchema>`

```typescript
type SeedData<TSchema extends DatabaseSchema> = {
  [K in keyof TSchema]?: Record<string, unknown>[];
};
```

See [Seeders Guide](./seeders.md) for detailed usage.

---

## Query Timeout

### `.timeout(ms)`

Set a per-query timeout. If the query exceeds the deadline, `PawQLTimeoutError` is thrown.

```typescript
db.query('users').timeout(5000).execute();
```

### `PawQLTimeoutError`

```typescript
class PawQLTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly sql: string;
}
```

See [Query Timeout Guide](./query-timeout.md) for detailed usage.

---

## Hooks / Middleware

### `db.hook(table, event, callback)`

Register a lifecycle hook on a table or globally (`'*'`).

```typescript
db.hook('users', 'beforeInsert', (ctx) => {
  ctx.data.createdAt = new Date();
});
```

### `db.unhook(table, event?)`

Remove hooks for a table/event.

### `HookEvent`

```typescript
type HookEvent =
  | "beforeInsert" | "afterInsert"
  | "beforeUpdate" | "afterUpdate"
  | "beforeDelete" | "afterDelete"
  | "beforeSelect" | "afterSelect";
```

### `HookContext`

```typescript
interface HookContext<T = any> {
  table: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "SELECT";
  data?: Partial<T> | Partial<T>[];
  result?: T[];
}
```

### `HookRegistry`

```typescript
class HookRegistry {
  on(table: string, event: HookEvent, callback: HookCallback): void;
  off(table: string, event?: HookEvent): void;
  clear(): void;
  has(table: string, event: HookEvent): boolean;
  get hooks(): ReadonlyArray<HookEntry>;
}
```

See [Hooks Guide](./hooks.md) for detailed usage.

---

## Relations

### `hasMany(to, foreignKey, localKey?)`

Define a one-to-many relation.

```typescript
hasMany('posts', 'userId')           // users.id = posts.userId
hasMany('posts', 'userId', 'uid')    // users.uid = posts.userId
```

### `belongsTo(to, foreignKey, localKey?)`

Define a many-to-one relation.

```typescript
belongsTo('users', 'userId')  // posts.userId = users.id
```

### `hasOne(to, foreignKey, localKey?)`

Define a one-to-one relation.

```typescript
hasOne('profiles', 'userId')  // users.id = profiles.userId
```

### `defineRelations(schema)`

Build a resolved relations map from relation helper definitions.

```typescript
const relations = defineRelations({
  users: { posts: hasMany('posts', 'userId') },
  posts: { author: belongsTo('users', 'userId') },
});
```

### `.with(relationName)`

Auto-join a related table using a defined relation.

```typescript
db.query('users').with('posts').execute();
// → SELECT * FROM "users" LEFT JOIN "posts" ON "users"."id" = "posts"."userId"
```

### `RelationDefinition`

```typescript
interface RelationDefinition {
  type: "hasMany" | "belongsTo" | "hasOne";
  from: string;
  to: string;
  foreignKey: string;
  localKey?: string;
}
```

### `RelationManager`

```typescript
class RelationManager {
  get(table: string, name: string): RelationDefinition | undefined;
  getAll(table: string): Record<string, RelationDefinition> | undefined;
  resolveJoin(table: string, name: string): JoinParams | null;
}
```

See [Relations Guide](./relations.md) for detailed usage.

---

## Introspection

### `pawql introspect`

Generates a `schema.ts` file from an existing database by inspecting `information_schema` or `PRAGMA table_info`.

```bash
npx pawql introspect [output-file]
```

### `introspectDatabase(adapter)`

Programmatic API for introspection.

```typescript
import { introspectDatabase } from "pawql/cli/introspect";
const code = await introspectDatabase(db.adapter);
```

See [Introspection Guide](./introspection.md) for detailed usage.

---

## Adapters

PawQL exposes three native adapters. See [Adapters Guide](./adapters.md) for details.

### `PostgresAdapter`
Wraps `pg`. Includes connection pool management.

### `MysqlAdapter`
Wraps `mysql2` promises.

### `SqliteAdapter`
Wraps `better-sqlite3` and adapts it to async workflow.
