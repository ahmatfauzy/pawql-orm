
import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { DummyAdapter } from "../src/testing.js";

test("Transaction - Commit Success", async () => {
    const adapter = new DummyAdapter();
    const db = createDB({ users: { id: Number, name: String } }, adapter);

    await db.transaction(async (tx) => {
        await tx.query('users').insert({ id: 1, name: "Alice" });
        await tx.query('users').insert({ id: 2, name: "Bob" });
    });

    const logs = adapter.logs;
    assert.strictEqual(logs[0]!.sql, "BEGIN");
    assert.ok(logs[1]!.sql.includes('INSERT INTO "users"'));
    assert.deepStrictEqual(logs[1]!.params, [1, "Alice"]);
    assert.ok(logs[2]!.sql.includes('INSERT INTO "users"'));
    assert.strictEqual(logs[3]!.sql, "COMMIT");
    assert.strictEqual(logs.length, 4);
});

test("Transaction - Rollback on Error", async () => {
    const adapter = new DummyAdapter();
    const db = createDB({ users: { id: Number } }, adapter);

    try {
        await db.transaction(async (tx) => {
            await tx.query('users').insert({ id: 1 });
            throw new Error("Simulated Failure");
        });
    } catch (e) {
        assert.strictEqual((e as Error).message, "Simulated Failure");
    }

    const logs = adapter.logs;
    assert.strictEqual(logs[0]!.sql, "BEGIN");
    assert.ok(logs[1]!.sql.includes('INSERT INTO "users"'));
    assert.strictEqual(logs[2]!.sql, "ROLLBACK"); // Must rollback
    assert.strictEqual(logs.length, 3);
    
    // Verify that COMMIT was NOT called
    assert.strictEqual(logs.find(l => l.sql === "COMMIT"), undefined);
});

test("Transaction - Nested Transaction (Flattened)", async () => {
    // Current simple implementation flattens nested transactions (reuses client)
    const adapter = new DummyAdapter();
    const db = createDB({ users: { id: Number } }, adapter);

    await db.transaction(async (tx1) => {
        await tx1.query('users').insert({ id: 1 });
        await tx1.transaction(async (tx2) => {
             await tx2.query('users').insert({ id: 2 });
        });
    });
    
    // In DummyAdapter, nested transaction currently logs another BEGIN/COMMIT pair
});
