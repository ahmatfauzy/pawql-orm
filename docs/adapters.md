# Adapters

PawQL interacts with databases exclusively through Adapters. An adapter must implement the `DatabaseAdapter` interface. PawQL supports multiple dialects out of the box — DDL and query generation is dialect-aware.

## Dialect Compatibility

| Feature | PostgreSQL | MySQL / MariaDB | SQLite |
| :--- | :---: | :---: | :---: |
| `createTables()` / `MigrationRunner` | ✅ | ✅ (via `JSON`/`VARCHAR(36)`, `BOOLEAN`→`TINYINT`) | ✅ (via `TEXT`/`INTEGER`) |
| `arrayType()` | ✅ (`TEXT[]`) | ❌ throws — use `json()` | ❌ throws — use `json()` |
| `uuid` | `UUID` | `VARCHAR(36)` | `TEXT` |
| `json()` | `JSONB` | `JSON` | `TEXT` |
| `RETURNING *` | ✅ | ❌ auto-stripped (returns `rowCount` only) | ✅ (SQLite 3.35+) |
| `ILIKE` | ✅ | ❌ throws | ❌ throws |
| `ON CONFLICT` | ✅ | ❌ `ON DUPLICATE KEY UPDATE` via `db.raw()` | ✅ |
| `FULL JOIN` | ✅ | ❌ | ❌ |
| `RIGHT JOIN` | ✅ | ✅ | ❌ |
| `Migrator` tracking table | `SERIAL` + `NOW()` | `AUTO_INCREMENT` + `CURRENT_TIMESTAMP` | `AUTOINCREMENT` + `CURRENT_TIMESTAMP` |
| `DROP TABLE ... CASCADE` | ✅ | ✅ (CASCADE stripped) | ✅ (CASCADE stripped) |

> MySQL and SQLite use `?` placeholders — PawQL automatically converts `$1` → `?` via adapters.

## PostgreSQL (`pg`)

The Postgres adapter wraps `pg` natively connected pools.

### Installation

```bash
npm install pg
```

### Usage

```typescript
import { PostgresAdapter, createDB } from "pawql";

const adapter = new PostgresAdapter({
  connectionString: process.env.DATABASE_URL,
  max: 20, // pool options
});

const db = createDB(schema, adapter);
```

## MySQL / MariaDB (`mysql2`)

The Mysql adapter wraps `mysql2` async connection pools natively.

### Installation

```bash
npm install mysql2
```

### Usage

```typescript
import { MysqlAdapter, createDB } from "pawql";

// Supports simple connection config...
const adapter = new MysqlAdapter({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'test_db',
});

// ...or passing an existing mysql2/promise Pool
// const adapter = new MysqlAdapter(myExistingPool);

const db = createDB(schema, adapter);
```

## SQLite (`better-sqlite3` / `bun:sqlite`)

The SQLite adapter wraps the high-performance synchronous driver `better-sqlite3` (Node.js) or `bun:sqlite` (Bun — auto-detected).

### Installation

```bash
npm install better-sqlite3  # Node.js only — Bun has built-in support
```

### Usage

```typescript
import { SqliteAdapter, createDB } from "pawql";

// SQLite connects via filename:
const adapter = new SqliteAdapter('database.sqlite');
// or ':memory:' for tests (uses AUTOINCREMENT, CURRENT_TIMESTAMP for Migrator)

const db = createDB(schema, adapter);
```

### Custom Adapter

Implement `DatabaseAdapter` for any dialect:

```typescript
import type { DatabaseAdapter, QueryResult } from 'pawql';

class MyAdapter implements DatabaseAdapter {
  dialect = 'my-dialect';
  quote(id: string) { return `"${id}"`; }
  async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> { /* ... */ }
  async transaction<T>(cb: (trx: DatabaseAdapter) => Promise<T>): Promise<T> { /* ... */ }
  async close(): Promise<void> {}
}
```
