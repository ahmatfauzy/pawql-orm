
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
  posts: {
    id: Number,
    title: String,
    content: String,
    published: Boolean,
  },
};

test("Query Builder Tests - createDB initializes correctly", () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);
    
    // Check internal schema storage
    assert.strictEqual(db.schema.users.id, Number);
});

test("Query Builder Tests - query builder generates correct SQL for select + where", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .select('id', 'name')
        .where({ id: 1 })
        .execute();

    const logs = adapter.logs;
    const lastLog = logs[logs.length - 1]!;
    assert.strictEqual(lastLog.sql, 'SELECT "id", "name" FROM "users" WHERE "id" = $1');
    assert.strictEqual(lastLog.params[0], 1);
});

test("Query Builder Tests - query builder generates correct SQL for insert", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .insert({ id: 1, name: "Alice", email: "alice@example.com" })
        .execute();

    const logs = adapter.logs;
    const lastLog = logs[logs.length - 1]!;
    
    // "INSERT INTO "users" ("id", "name", "email") VALUES ($1, $2, $3) RETURNING *"
    assert.ok(lastLog.sql.startsWith('INSERT INTO "users"'));
    assert.ok(lastLog.sql.includes('VALUES ($1, $2, $3)'));
    assert.strictEqual(lastLog.params.length, 3);
});

test("Query Builder Tests - query builder generates correct SQL for update", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .update({ name: "Bob" })
        .where({ id: 1 })
        .execute();

    const logs = adapter.logs;
    const lastLog = logs[logs.length - 1]!;
    
    // "UPDATE "users" SET "name" = $1 WHERE "id" = $2 RETURNING *"
    assert.ok(lastLog.sql.startsWith('UPDATE "users" SET "name" = $1'));
    assert.ok(lastLog.sql.includes('WHERE "id" = $2'));
    assert.strictEqual(lastLog.params[0], "Bob");
    assert.strictEqual(lastLog.params[1], 1);
});

test("Query Builder Tests - query builder generates correct SQL for delete", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .delete()
        .where({ id: 1 })
        .execute();

    const logs = adapter.logs;
    const lastLog = logs[logs.length - 1]!;
    
    assert.strictEqual(lastLog.sql, 'DELETE FROM "users" WHERE "id" = $1 RETURNING *');
    assert.strictEqual(lastLog.params[0], 1);
});
