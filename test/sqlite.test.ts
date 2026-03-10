import { test } from "node:test";
import assert from "node:assert";
import { SqliteAdapter } from "../src/adapters/sqlite.js";
import { createDB } from "../src/core/database.js";
import { DatabaseSchema } from "../src/types/schema.js";

const schema = {
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    isActive: Boolean,
  },
} satisfies DatabaseSchema;

test("SqliteAdapter — standard CRUD and transaction", async () => {
  // Use in-memory database for testing
  const adapter = new SqliteAdapter(':memory:');
  const db = createDB(schema, adapter);

  // DDL
  await db.createTables();

  // Insert
  await db.query("users").insert({ id: 1, name: "Alice", isActive: true }).execute();
  await db.query("users").insert({ id: 2, name: "Bob", isActive: false }).execute();

  // Select
  const users = await db.query("users").execute();
  assert.strictEqual(users.length, 2);
  assert.strictEqual(users[0]!.name, "Alice");

  // Where with parameters
  const bob = await db.query("users").where({ name: "Bob" }).first();
  assert.ok(bob);
  assert.strictEqual(bob!.id, 2);

  // Transaction
  await db.transaction(async (tx) => {
    await tx.query("users").insert({ id: 3, name: "Charlie", isActive: true }).execute();
    
    // Rollback by throwing
    throw new Error("Rollback!");
  }).catch(() => {});

  // Charlie should practically not exist
  const count = await db.query("users").count();
  assert.strictEqual(count, 2);

  await db.close();
});
