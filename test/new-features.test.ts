
import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { DummyAdapter } from "../src/testing.js";

const schema = {
  users: {
    id: Number,
    name: String,
    age: Number,
    email: String,
    createdAt: Date,
  },
  posts: {
    id: Number,
    userId: Number,
    title: String,
  }
};

// ============================================
// ORDER BY Tests
// ============================================

test("ORDER BY - single column ASC", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .orderBy('name', 'ASC')
        .execute();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" ORDER BY "name" ASC');
    assert.deepStrictEqual(lastLog.params, []);
});

test("ORDER BY - single column DESC", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .orderBy('createdAt', 'DESC')
        .execute();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" ORDER BY "createdAt" DESC');
});

test("ORDER BY - default direction is ASC", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .orderBy('name')
        .execute();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" ORDER BY "name" ASC');
});

test("ORDER BY - multiple columns", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .orderBy('age', 'DESC')
        .orderBy('name', 'ASC')
        .execute();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" ORDER BY "age" DESC, "name" ASC');
});

test("ORDER BY - with WHERE and LIMIT", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .where({ age: { gt: 18 } })
        .orderBy('name', 'ASC')
        .limit(10)
        .offset(5)
        .execute();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "age" > $1 ORDER BY "name" ASC LIMIT 10 OFFSET 5');
    assert.deepStrictEqual(lastLog.params, [18]);
});

// ============================================
// BETWEEN Tests
// ============================================

test("BETWEEN - basic usage", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .where({ age: { between: [18, 60] } })
        .execute();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "age" BETWEEN $1 AND $2');
    assert.deepStrictEqual(lastLog.params, [18, 60]);
});

test("BETWEEN - combined with other conditions", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .where({ name: 'Alice' })
        .where({ age: { between: [20, 30] } })
        .execute();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "name" = $1 AND "age" BETWEEN $2 AND $3');
    assert.deepStrictEqual(lastLog.params, ['Alice', 20, 30]);
});

// ============================================
// .first() Tests
// ============================================

test("first() - generates LIMIT 1", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    const result = await db.query('users')
        .where({ id: 1 })
        .first();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "id" = $1 LIMIT 1');
    assert.deepStrictEqual(lastLog.params, [1]);
    // DummyAdapter returns empty rows, so first() should return null
    assert.strictEqual(result, null);
});

test("first() - with select", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .select('id', 'name')
        .where({ name: 'Alice' })
        .first();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.strictEqual(lastLog.sql, 'SELECT "id", "name" FROM "users" WHERE "name" = $1 LIMIT 1');
});

// ============================================
// .count() Tests
// ============================================

test("count() - basic count", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users').count();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.strictEqual(lastLog.sql, 'SELECT COUNT(*) FROM "users"');
    assert.deepStrictEqual(lastLog.params, []);
});

test("count() - with WHERE", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .where({ age: { gt: 18 } })
        .count();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.strictEqual(lastLog.sql, 'SELECT COUNT(*) FROM "users" WHERE "age" > $1');
    assert.deepStrictEqual(lastLog.params, [18]);
});

test("count() - returns 0 for empty result", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    const result = await db.query('users').count();
    assert.strictEqual(result, 0);
});

// ============================================
// Controllable RETURNING Tests
// ============================================

test("RETURNING - default is RETURNING * for INSERT", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .insert({ id: 1, name: 'Alice', age: 25, email: 'alice@test.com', createdAt: new Date('2024-01-01') })
        .execute();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.ok(lastLog.sql.includes('RETURNING *'));
});

test("RETURNING - specific columns", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .insert({ id: 1, name: 'Alice', age: 25, email: 'alice@test.com', createdAt: new Date('2024-01-01') })
        .returning('id', 'name')
        .execute();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.ok(lastLog.sql.includes('RETURNING "id", "name"'));
    assert.ok(!lastLog.sql.includes('RETURNING *'));
});

test("RETURNING - disabled with false", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .insert({ id: 1, name: 'Alice', age: 25, email: 'alice@test.com', createdAt: new Date('2024-01-01') })
        .returning(false)
        .execute();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.ok(!lastLog.sql.includes('RETURNING'));
});

test("RETURNING - works with UPDATE", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .update({ name: 'Bob' })
        .where({ id: 1 })
        .returning('id', 'name')
        .execute();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.ok(lastLog.sql.includes('RETURNING "id", "name"'));
});

test("RETURNING - works with DELETE", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .delete()
        .where({ id: 1 })
        .returning(false)
        .execute();

    const lastLog = adapter.logs[adapter.logs.length - 1]!;
    assert.ok(!lastLog.sql.includes('RETURNING'));
});
