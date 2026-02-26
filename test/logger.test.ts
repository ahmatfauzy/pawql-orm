import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { DummyAdapter } from "../src/testing.js";
import { PawQLLogger, consoleLogger, silentLogger } from "../src/core/logger.js";

const schema = {
  users: {
    id: Number,
    name: String,
  },
};

// ============================================
// Logger / Debug Mode Tests
// ============================================

test("Logger - custom logger receives query info", async () => {
  const adapter = new DummyAdapter();
  const logged: { sql: string; params: any[] | undefined; durationMs: number }[] = [];

  const myLogger: PawQLLogger = {
    query(sql, params, durationMs) {
      logged.push({ sql, params, durationMs });
    },
  };

  const db = createDB(schema, adapter, { logger: myLogger });

  await db.query("users").where({ id: 1 }).execute();

  assert.strictEqual(logged.length, 1);
  assert.strictEqual(logged[0]!.sql, 'SELECT * FROM "users" WHERE "id" = $1');
  assert.deepStrictEqual(logged[0]!.params, [1]);
  assert.strictEqual(typeof logged[0]!.durationMs, "number");
  assert.ok(logged[0]!.durationMs >= 0);
});

test("Logger - logs multiple queries", async () => {
  const adapter = new DummyAdapter();
  const logged: string[] = [];

  const db = createDB(schema, adapter, {
    logger: {
      query(sql) {
        logged.push(sql);
      },
    },
  });

  await db.query("users").execute();
  await db.query("users").where({ name: "Alice" }).execute();

  assert.strictEqual(logged.length, 2);
  assert.strictEqual(logged[0], 'SELECT * FROM "users"');
  assert.ok(logged[1]!.includes("WHERE"));
});

test("Logger - works with raw()", async () => {
  const adapter = new DummyAdapter();
  const logged: string[] = [];

  const db = createDB(schema, adapter, {
    logger: { query(sql) { logged.push(sql); } },
  });

  await db.raw("SELECT NOW()");

  assert.strictEqual(logged.length, 1);
  assert.strictEqual(logged[0], "SELECT NOW()");
});

test("Logger - works with insert", async () => {
  const adapter = new DummyAdapter();
  const logged: string[] = [];

  const db = createDB(schema, adapter, {
    logger: { query(sql) { logged.push(sql); } },
  });

  await db.query("users").insert({ id: 1, name: "Alice" }).execute();

  assert.strictEqual(logged.length, 1);
  assert.ok(logged[0]!.includes("INSERT INTO"));
});

test("Logger - no logger = no error", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter); // No logger

  // Should work without any issues
  await db.query("users").execute();
  assert.ok(true);
});

test("Logger - silentLogger discards output", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, { logger: silentLogger });

  // silentLogger should not throw
  await db.query("users").execute();
  await db.raw("SELECT 1");
  assert.ok(true);
});

test("Logger - consoleLogger exists and is a valid PawQLLogger", () => {
  assert.strictEqual(typeof consoleLogger.query, "function");
});
