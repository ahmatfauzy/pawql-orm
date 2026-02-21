
import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { DummyAdapter } from "../src/testing.js";
import { json, uuid, enumType, arrayType } from "../src/types/schema.js";

// ============================================
// Type Inference Tests (compile-time checks)
// ============================================

test("Data Types - JSON type inference", () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    products: {
      id: Number,
      metadata: json<{ tags: string[]; color: string }>(),
    }
  }, adapter);

  const schema = db.schema;
  assert.ok(schema.products.metadata);
  // @ts-ignore
  assert.strictEqual(schema.products.metadata._brand, "json");
});

test("Data Types - UUID type inference", () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    users: {
      id: uuid,
      name: String,
    }
  }, adapter);

  // @ts-ignore
  assert.strictEqual(db.schema.users.id._brand, "uuid");
});

test("Data Types - Enum type inference", () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    users: {
      id: Number,
      role: enumType('admin', 'user', 'guest'),
    }
  }, adapter);

  // @ts-ignore
  assert.strictEqual(db.schema.users.role._brand, "enum");
  // @ts-ignore
  assert.deepStrictEqual(db.schema.users.role.values, ['admin', 'user', 'guest']);
});

test("Data Types - Array type inference", () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    posts: {
      id: Number,
      tags: arrayType(String),
    }
  }, adapter);

  // @ts-ignore
  assert.strictEqual(db.schema.posts.tags._brand, "array");
  // @ts-ignore
  assert.strictEqual(db.schema.posts.tags.itemType, String);
});

// ============================================
// DDL Generation Tests
// ============================================

test("DDL - JSON column generates JSONB", async () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    products: {
      id: { type: Number, primaryKey: true },
      metadata: json<{ tags: string[] }>(),
    }
  }, adapter);

  await db.createTables();

  const sql = adapter.logs[0]!.sql;
  assert.ok(sql.includes('"metadata" JSONB NOT NULL'));
});

test("DDL - UUID column generates UUID", async () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    users: {
      id: uuid,
      name: String,
    }
  }, adapter);

  await db.createTables();

  const sql = adapter.logs[0]!.sql;
  assert.ok(sql.includes('"id" UUID NOT NULL'));
});

test("DDL - Enum column generates TEXT with CHECK", async () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    users: {
      id: { type: Number, primaryKey: true },
      role: enumType('admin', 'user', 'guest'),
    }
  }, adapter);

  await db.createTables();

  const sql = adapter.logs[0]!.sql;
  assert.ok(sql.includes(`"role" TEXT NOT NULL CHECK ("role" IN ('admin', 'user', 'guest'))`));
});

test("DDL - Array column generates TYPE[]", async () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    posts: {
      id: { type: Number, primaryKey: true },
      tags: arrayType(String),
      scores: arrayType(Number),
    }
  }, adapter);

  await db.createTables();

  const sql = adapter.logs[0]!.sql;
  assert.ok(sql.includes('"tags" TEXT[] NOT NULL'));
  assert.ok(sql.includes('"scores" INTEGER[] NOT NULL'));
});

test("DDL - Mixed schema with all new types", async () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    events: {
      id: uuid,
      name: String,
      type: enumType('conference', 'meetup', 'workshop'),
      tags: arrayType(String),
      details: json<{ location: string }>(),
      createdAt: Date,
    }
  }, adapter);

  await db.createTables();

  const sql = adapter.logs[0]!.sql;
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS "events"'));
  assert.ok(sql.includes('"id" UUID NOT NULL'));
  assert.ok(sql.includes('"name" TEXT NOT NULL'));
  assert.ok(sql.includes('"type" TEXT NOT NULL CHECK'));
  assert.ok(sql.includes('"tags" TEXT[] NOT NULL'));
  assert.ok(sql.includes('"details" JSONB NOT NULL'));
  assert.ok(sql.includes('"createdAt" TIMESTAMP NOT NULL'));
});
