
import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { DummyAdapter } from "../src/testing.js";

const schema = {
  users: {
    id: Number,
    name: String,
    age: Number,
    status: String,
    deletedAt: Date
  }
};

test("Advanced Filtering - OR", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .where({ name: 'John' })
        .orWhere({ name: 'Doe' })
        .execute();

    const logs = adapter.logs;
    const lastLog = logs[logs.length - 1]!;
    
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "name" = $1 OR "name" = $2');
    assert.deepStrictEqual(lastLog.params, ["John", "Doe"]);
});

test("Advanced Filtering - IN", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .where({ status: { in: ['active', 'pending'] } })
        .execute();

    const logs = adapter.logs;
    const lastLog = logs[logs.length - 1]!;
    
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "status" IN ($1, $2)');
    assert.deepStrictEqual(lastLog.params, ["active", "pending"]);
});

test("Advanced Filtering - LIKE", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .where({ name: { like: '%John%' } })
        .execute();

    const logs = adapter.logs;
    const lastLog = logs[logs.length - 1]!;
    
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "name" LIKE $1');
    assert.deepStrictEqual(lastLog.params, ["%John%"]);
});

test("Advanced Filtering - Comparison", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .where({ age: { gt: 18, lte: 60 } })
        .execute();

    const logs = adapter.logs;
    const lastLog = logs[logs.length - 1]!;
    
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "age" > $1 AND "age" <= $2');
    assert.deepStrictEqual(lastLog.params, [18, 60]);
});

test("Advanced Filtering - IS NULL", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .where({ deletedAt: null })
        .execute();

    const logs = adapter.logs;
    const lastLog = logs[logs.length - 1]!;
    
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "deletedAt" IS NULL');
    assert.deepStrictEqual(lastLog.params, []);
});
