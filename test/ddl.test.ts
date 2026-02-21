import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { DummyAdapter } from "../src/testing.js";

test("DDL Generation - single table", async () => {
    const adapter = new DummyAdapter();
    const db = createDB({
        users: {
            id: { type: Number, primaryKey: true },
            name: String,
            email: { type: String, nullable: true },
            isActive: { type: Boolean, default: true },
            score: { type: Number, default: 0 }
        }
    }, adapter);

    await db.createTables();

    const logs = adapter.logs;
    assert.strictEqual(logs.length, 1);
    const sql = logs[0]!.sql;
    
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS "users"'));
    assert.ok(sql.includes('"id" INTEGER PRIMARY KEY'));
    assert.ok(sql.includes('"name" TEXT NOT NULL')); // Implicit not null
    assert.ok(sql.includes('"email" TEXT')); // Nullable, no NOT NULL
    assert.ok(sql.includes('"isActive" BOOLEAN NOT NULL DEFAULT TRUE'));
    assert.ok(sql.includes('"score" INTEGER NOT NULL DEFAULT 0'));
});

test("DDL Generation - multiple tables", async () => {
    const adapter = new DummyAdapter();
    const db = createDB({
        users: { id: { type: Number, primaryKey: true } },
        posts: { id: { type: Number, primaryKey: true }, userId: Number }
    }, adapter);

    await db.createTables();

    const logs = adapter.logs;
    assert.strictEqual(logs.length, 2);
    assert.ok(logs[0]!.sql.includes('CREATE TABLE IF NOT EXISTS "users"'));
    assert.ok(logs[1]!.sql.includes('CREATE TABLE IF NOT EXISTS "posts"'));
});
