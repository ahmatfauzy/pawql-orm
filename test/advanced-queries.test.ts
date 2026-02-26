import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { DummyAdapter } from "../src/testing.js";
import { subquery } from "../src/query/builder.js";

const schema = {
  users: {
    id: Number,
    name: String,
    email: String,
    age: Number,
    role: String,
  },
  orders: {
    id: Number,
    userId: Number,
    total: Number,
    status: String,
  },
  products: {
    id: Number,
    name: String,
    price: Number,
    category: String,
  },
};

// ============================================
// ON CONFLICT / Upsert Tests
// ============================================

test("ON CONFLICT DO NOTHING", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db
    .query("users")
    .insert({ id: 1, name: "Alice", email: "alice@test.com", age: 25, role: "admin" })
    .onConflict("id")
    .doNothing()
    .returning(false)
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.ok(lastLog.sql.includes('ON CONFLICT ("id") DO NOTHING'));
  assert.ok(!lastLog.sql.includes("RETURNING"));
});

test("ON CONFLICT DO UPDATE - single column conflict", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db
    .query("users")
    .insert({ id: 1, name: "Alice", email: "alice@test.com", age: 25, role: "admin" })
    .onConflict("id")
    .doUpdate({ name: "Alice Updated", email: "new@test.com" })
    .returning(false)
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.ok(lastLog.sql.includes('ON CONFLICT ("id") DO UPDATE SET'));
  assert.ok(lastLog.sql.includes('"name" ='));
  assert.ok(lastLog.sql.includes('"email" ='));
  assert.ok(!lastLog.sql.includes("RETURNING"));
  // Check params include both insert and update values
  assert.ok(lastLog.params.includes("Alice Updated"));
  assert.ok(lastLog.params.includes("new@test.com"));
});

test("ON CONFLICT DO UPDATE - multiple conflict columns", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db
    .query("users")
    .insert({ id: 1, name: "Alice", email: "alice@test.com", age: 25, role: "admin" })
    .onConflict("id", "email")
    .doUpdate({ name: "Alice Updated" })
    .returning(false)
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.ok(lastLog.sql.includes('ON CONFLICT ("id", "email") DO UPDATE SET'));
});

test("ON CONFLICT with RETURNING", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db
    .query("users")
    .insert({ id: 1, name: "Alice", email: "alice@test.com", age: 25, role: "admin" })
    .onConflict("id")
    .doUpdate({ name: "Alice Updated" })
    .returning("id", "name")
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.ok(lastLog.sql.includes("ON CONFLICT"));
  assert.ok(lastLog.sql.includes('RETURNING "id", "name"'));
});

// ============================================
// GROUP BY + HAVING Tests
// ============================================

test("GROUP BY - single column", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db
    .query("orders")
    .select("status")
    .groupBy("status")
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT "status" FROM "orders" GROUP BY "status"'
  );
});

test("GROUP BY - multiple columns", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db
    .query("orders")
    .select("userId", "status")
    .groupBy("userId", "status")
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT "userId", "status" FROM "orders" GROUP BY "userId", "status"'
  );
});

test("GROUP BY with HAVING", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db
    .query("orders")
    .select("userId")
    .groupBy("userId")
    .having("COUNT(*) > $1", 5)
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT "userId" FROM "orders" GROUP BY "userId" HAVING COUNT(*) > $1'
  );
  assert.deepStrictEqual(lastLog.params, [5]);
});

test("GROUP BY + HAVING + WHERE", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db
    .query("orders")
    .select("userId")
    .where({ status: "completed" })
    .groupBy("userId")
    .having("SUM(total) > $1", 1000)
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT "userId" FROM "orders" WHERE "status" = $1 GROUP BY "userId" HAVING SUM(total) > $2'
  );
  assert.deepStrictEqual(lastLog.params, ["completed", 1000]);
});

test("GROUP BY + HAVING + ORDER BY", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db
    .query("orders")
    .select("userId")
    .groupBy("userId")
    .having("COUNT(*) > $1", 3)
    .orderBy("userId", "ASC")
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT "userId" FROM "orders" GROUP BY "userId" HAVING COUNT(*) > $1 ORDER BY "userId" ASC'
  );
  assert.deepStrictEqual(lastLog.params, [3]);
});

test("GROUP BY + multiple HAVING", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await db
    .query("orders")
    .select("userId")
    .groupBy("userId")
    .having("COUNT(*) > $1", 2)
    .having("SUM(total) > $1", 500)
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT "userId" FROM "orders" GROUP BY "userId" HAVING COUNT(*) > $1 AND SUM(total) > $2'
  );
  assert.deepStrictEqual(lastLog.params, [2, 500]);
});

// ============================================
// Subqueries Tests
// ============================================

test("Subquery in WHERE - IN subquery", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  const orderUserIds = db
    .query("orders")
    .select("userId")
    .where({ status: "completed" });

  await db
    .query("users")
    .where({ id: { subquery: subquery(orderUserIds) } })
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT * FROM "users" WHERE "id" IN (SELECT "userId" FROM "orders" WHERE "status" = $1)'
  );
  assert.deepStrictEqual(lastLog.params, ["completed"]);
});

test("Subquery in WHERE - with outer params", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  const highSpenders = db
    .query("orders")
    .select("userId")
    .where({ total: { gt: 100 } });

  await db
    .query("users")
    .where({ role: "admin" })
    .where({ id: { subquery: subquery(highSpenders) } })
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT * FROM "users" WHERE "role" = $1 AND "id" IN (SELECT "userId" FROM "orders" WHERE "total" > $2)'
  );
  assert.deepStrictEqual(lastLog.params, ["admin", 100]);
});

test("Subquery in FROM", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  const expensiveOrders = db
    .query("orders")
    .where({ total: { gt: 500 } });

  await db
    .query("orders")
    .select("userId")
    .from(subquery(expensiveOrders).as("expensive"))
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT "userId" FROM (SELECT * FROM "orders" WHERE "total" > $1) AS "expensive"'
  );
  assert.deepStrictEqual(lastLog.params, [500]);
});

test("Subquery in FROM with additional WHERE", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  const activeUsers = db
    .query("users")
    .where({ role: "admin" });

  await db
    .query("users")
    .select("name")
    .from(subquery(activeUsers).as("admins"))
    .where({ age: { gt: 18 } })
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT "name" FROM (SELECT * FROM "users" WHERE "role" = $1) AS "admins" WHERE "age" > $2'
  );
  assert.deepStrictEqual(lastLog.params, ["admin", 18]);
});
