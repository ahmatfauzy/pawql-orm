
import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { PawQLTimeoutError } from "../src/query/builder.js";
import { DummyAdapter } from "../src/testing.js";
import { DatabaseAdapter, QueryResult } from "../src/core/adapter.js";

// ============================================
// Test Schema
// ============================================

const schema = {
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    age: Number,
  },
};

// ============================================
// A "slow" adapter that delays responses
// ============================================

class SlowAdapter implements DatabaseAdapter {
  private _delayMs: number;
  logs: { sql: string; params: any[] }[] = [];

  constructor(delayMs: number) {
    this._delayMs = delayMs;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    this.logs.push({ sql, params: params || [] });
    await new Promise((r) => setTimeout(r, this._delayMs));
    return { rows: [], rowCount: 0 };
  }

  async transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T> {
    this.logs.push({ sql: "BEGIN", params: [] });
    try {
      const result = await callback(this);
      this.logs.push({ sql: "COMMIT", params: [] });
      return result;
    } catch (e) {
      this.logs.push({ sql: "ROLLBACK", params: [] });
      throw e;
    }
  }

  quote(identifier: string): string {
    return `"${identifier}"`;
  }

  async close(): Promise<void> {}
}

// ============================================
// .timeout() — basic
// ============================================

test("timeout — fast query completes successfully", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  // DummyAdapter resolves instantly, so timeout(5000) should never trigger
  const rows = await db.query("users").timeout(5000).execute();
  assert.ok(Array.isArray(rows));
});

test("timeout — slow query throws PawQLTimeoutError", async () => {
  const slowAdapter = new SlowAdapter(500); // 500ms delay
  const db = createDB(schema, slowAdapter);

  await assert.rejects(
    () => db.query("users").timeout(50).execute(), // 50ms timeout < 500ms delay
    (err: any) => {
      assert.ok(err instanceof PawQLTimeoutError);
      assert.strictEqual(err.timeoutMs, 50);
      assert.ok(err.sql.includes("users"));
      assert.ok(err.message.includes("timed out"));
      return true;
    }
  );
});

test("timeout — .first() also respects timeout", async () => {
  const slowAdapter = new SlowAdapter(500);
  const db = createDB(schema, slowAdapter);

  await assert.rejects(
    () => db.query("users").timeout(50).first(),
    (err: any) => {
      assert.ok(err instanceof PawQLTimeoutError);
      return true;
    }
  );
});

test("timeout — .count() also respects timeout", async () => {
  const slowAdapter = new SlowAdapter(500);
  const db = createDB(schema, slowAdapter);

  await assert.rejects(
    () => db.query("users").timeout(50).count(),
    (err: any) => {
      assert.ok(err instanceof PawQLTimeoutError);
      return true;
    }
  );
});

test("timeout — timeout is per-query, not global", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  // First query has timeout
  await db.query("users").timeout(5000).execute();

  // Second query without timeout should still work
  await db.query("users").execute();

  assert.strictEqual(adapter.logs.length, 2);
});

test("timeout — PawQLTimeoutError has correct properties", async () => {
  const slowAdapter = new SlowAdapter(200);
  const db = createDB(schema, slowAdapter);

  try {
    await db.query("users").where({ id: 1 }).timeout(10).execute();
    assert.fail("Should have thrown");
  } catch (err: any) {
    assert.ok(err instanceof PawQLTimeoutError);
    assert.strictEqual(err.name, "PawQLTimeoutError");
    assert.strictEqual(err.timeoutMs, 10);
    assert.ok(typeof err.sql === "string");
  }
});

test("timeout — no timeout means no time limit", async () => {
  const adapter = new DummyAdapter(); // instant
  const db = createDB(schema, adapter);

  // No timeout set — should just work
  const rows = await db.query("users").execute();
  assert.ok(Array.isArray(rows));
});
