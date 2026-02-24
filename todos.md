# PawQL — Roadmap

## ✅ Completed

- [x] Runtime-first schema definition
- [x] TypeScript type inference (Zero Codegen)
- [x] Modular project structure (core, adapters, query)
- [x] Build system (TSC, Universal Node/Bun)
- [x] SELECT / INSERT / UPDATE / DELETE
- [x] SELECT * (All columns support)
- [x] Basic WHERE clause (AND only)
- [x] LIMIT & OFFSET support
- [x] Adapter Interface definition
- [x] PostgreSQL Adapter (peer dependency: pg)
- [x] Dummy/Test Adapter
- [x] **Table Synchronization (DDL)**: `db.createTables()`
- [x] **Advanced Filtering**: `OR`, `IN`, `LIKE`, `IS NULL`, comparison operators
- [x] **Data Types**: JSON, UUID, Enum, Arrays
- [x] **Transactions**: `db.transaction(...)` with auto-rollback
- [x] **Joins**: `INNER`, `LEFT`, `RIGHT`, `FULL` JOIN with type inference
- [x] **Universal Testing**: `node:test` compatible (Node.js + Bun)
- [x] **Identifier Quoting**: SQL safety for reserved keywords
- [x] **DDL String Escape**: Default string values properly escaped
- [x] README with usage examples
- [x] LICENSE file (MIT)

---

## 🔴 v0.3.0 — Query Essentials (Next Release)

- [x] **ORDER BY**: `.orderBy('column', 'ASC'|'DESC')` — required for meaningful LIMIT/OFFSET
- [x] **BETWEEN**: `.where({ age: { between: [18, 60] } })`
- [x] **`.first()`**: Return single row instead of array (`.limit(1)` + unwrap)
- [x] **`.count()`**: Shortcut for `SELECT COUNT(*) FROM table`
- [x] **Controllable RETURNING**: `.returning('id', 'name')` or `.returning(false)`
- [x] **Separate DummyAdapter**: Move test adapter out of production exports (`pawql/testing`)

---

## 🟡 v0.5.0 — Production Readiness

- [x] **Migrations (CLI)**: `pawql migrate:make`, `migrate:up`, `migrate:down`
- [x] **`.raw(sql, params)`**: Escape hatch for custom SQL queries
- [ ] **ON CONFLICT / Upsert**: PostgreSQL `INSERT ... ON CONFLICT DO UPDATE`
- [ ] **GROUP BY + HAVING**: Aggregation query support
- [ ] **Subqueries**: Support subqueries in WHERE/FROM
- [ ] **Logger / Debug Mode**: Built-in query logger to inspect generated SQL
- [ ] **Pool Management**: Expose connection pooling options in Adapter config
- [ ] **JSDoc comments**: Complete documentation for all public APIs

---

## 🟢 v1.0.0 — Stable Release

- [ ] **Integration Tests**: Comprehensive tests with real PostgreSQL (via Docker)
- [ ] **Soft Delete**: Native `deleted_at` handling (`.withTrashed()`, `.onlyTrashed()`)
- [ ] **Seeders**: Helper to populate initial data
- [ ] **Parameter Validation**: Runtime check for input values against schema types
- [ ] **Query Timeout**: Support canceling long-running queries
- [ ] **Hooks / Middleware**: `beforeInsert`, `afterUpdate`, etc.
- [ ] **Relations**: Define `hasMany`, `belongsTo` in schema for auto-joins
- [ ] **Schema Introspection**: Generate PawQL schema from existing database
- [ ] **Multi-database**: MySQL / SQLite adapter support

---

## 

- [ ] **Telemetry**: OpenTelemetry hooks for monitoring
- [ ] **CLI Scaffolding**: `pawql init`, `pawql generate adapter`
- [ ] **Connection URL parsing**: `createDB({ url: 'postgres://...' })`
- [ ] **Batch Insert optimization**: Chunked inserts for large datasets
- [ ] **Type-safe `.select()` return**: Narrow return type based on selected columns
- [ ] **`.toSQL().toString()`**: Debug-friendly query string output
- [ ] **Streaming**: Cursor-based result streaming for large queries
- [ ] **Plugin system**: Extensible architecture for community adapters
