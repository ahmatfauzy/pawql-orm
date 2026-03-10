# Adapters

PawQL interacts with databases exclusively through Adapters. An adapter must implement the `DatabaseAdapter` interface. PawQL supports multiple dialects out of the box.

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

## SQLite (`better-sqlite3`)

The SQLite adapter wraps the high-performance synchronous driver `better-sqlite3`.

### Installation

```bash
npm install better-sqlite3
```

### Usage

```typescript
import { SqliteAdapter, createDB } from "pawql";

// SQLite connects via filename:
const adapter = new SqliteAdapter('database.sqlite');
// or ':memory:' for tests

// Note: Ensure your environment matches better-sqlite3 build output.
const db = createDB(schema, adapter);
```
