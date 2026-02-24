import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { DummyAdapter } from "../src/testing.js";

const schema = {
  users: {
    id: Number,
    name: String,
    email: String,
  },
};

// ============================================
// db.raw() Tests
// ============================================

test("raw() - executes SQL without params", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db.raw("SELECT NOW()");

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, "SELECT NOW()");
  assert.deepStrictEqual(lastLog.params, []);
});

test("raw() - executes SQL with params", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db.raw("SELECT * FROM users WHERE id = $1 AND name = $2", [1, "Alice"]);

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    "SELECT * FROM users WHERE id = $1 AND name = $2"
  );
  assert.deepStrictEqual(lastLog.params, [1, "Alice"]);
});

test("raw() - returns QueryResult shape", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  const result = await db.raw("SELECT 1");

  assert.ok(Array.isArray(result.rows));
  assert.strictEqual(typeof result.rowCount, "number");
});

test("raw() - works for DDL statements", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db.raw("CREATE INDEX idx_users_email ON users(email)");

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    "CREATE INDEX idx_users_email ON users(email)"
  );
});

test("raw() - works for INSERT with RETURNING", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db.raw(
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3) RETURNING *",
    [1, "Alice", "alice@test.com"]
  );

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3) RETURNING *"
  );
  assert.deepStrictEqual(lastLog.params, [1, "Alice", "alice@test.com"]);
});

test("raw() - works inside transaction", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db.transaction(async (tx) => {
    await tx.raw("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)", [
      1,
      "Alice",
      "alice@test.com",
    ]);
    await tx.raw("UPDATE users SET name = $1 WHERE id = $2", ["Bob", 1]);
  });

  // Should have: BEGIN, INSERT, UPDATE, COMMIT
  assert.strictEqual(adapter.logs.length, 4);
  assert.strictEqual(adapter.logs[0]!.sql, "BEGIN");
  assert.ok(adapter.logs[1]!.sql.includes("INSERT INTO users"));
  assert.ok(adapter.logs[2]!.sql.includes("UPDATE users"));
  assert.strictEqual(adapter.logs[3]!.sql, "COMMIT");
});
