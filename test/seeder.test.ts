
import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { seed, createSeeder } from "../src/core/seeder.js";
import { PawQLValidationError } from "../src/core/validator.js";
import { DummyAdapter } from "../src/testing.js";

// ============================================
// Test Schema
// ============================================

const schema = {
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    email: { type: String, nullable: true },
    age: Number,
    isActive: { type: Boolean, default: true },
  },
  posts: {
    id: { type: Number, primaryKey: true },
    userId: Number,
    title: String,
    content: String,
  },
};

// ============================================
// seed() — Basic Seeding
// ============================================

test("seed — inserts rows into tables", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  const result = await seed(db, {
    users: [
      { id: 1, name: "Alice", age: 25 },
      { id: 2, name: "Bob", age: 30 },
    ],
  });

  assert.strictEqual(result.totalRows, 2);
  assert.strictEqual(result.tables.length, 1);
  assert.strictEqual(result.tables[0]!.name, "users");
  assert.strictEqual(result.tables[0]!.rows, 2);

  // Should have generated INSERT SQL (inside a transaction = BEGIN + INSERT + COMMIT)
  const insertLog = adapter.logs.find(l => l.sql.includes("INSERT"));
  assert.ok(insertLog, "Should have generated INSERT SQL");
  assert.ok(insertLog!.sql.includes('"users"'), "INSERT should target users table");
});

test("seed — seeds multiple tables", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  const result = await seed(db, {
    users: [
      { id: 1, name: "Alice", age: 25 },
    ],
    posts: [
      { id: 1, userId: 1, title: "Hello", content: "World" },
    ],
  });

  assert.strictEqual(result.totalRows, 2);
  assert.strictEqual(result.tables.length, 2);
});

test("seed — empty array skips table", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  const result = await seed(db, {
    users: [],
  });

  assert.strictEqual(result.totalRows, 0);
  assert.strictEqual(result.tables.length, 0);
});

// ============================================
// seed() — Validation
// ============================================

test("seed — validates data by default", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await assert.rejects(
    () => seed(db, {
      users: [
        { id: "not-a-number", name: 123, age: "wrong" } as any,
      ],
    }),
    (err: any) => {
      assert.ok(err instanceof PawQLValidationError);
      assert.strictEqual(err.table, "users");
      return true;
    }
  );
});

test("seed — validation can be disabled", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  // Should not throw even with bad data when validate=false
  await assert.doesNotReject(
    () => seed(db, {
      users: [
        { id: "not-a-number", name: 123, age: "wrong" } as any,
      ],
    }, { validate: false })
  );
});

// ============================================
// seed() — Unknown Table
// ============================================

test("seed — throws for unknown table", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await assert.rejects(
    () => seed(db, {
      nonExistentTable: [{ id: 1 }],
    } as any),
    (err: any) => {
      assert.ok(err.message.includes("nonExistentTable"));
      return true;
    }
  );
});

// ============================================
// seed() — Truncate
// ============================================

test("seed — truncate option deletes before inserting", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await seed(db, {
    users: [
      { id: 1, name: "Alice", age: 25 },
    ],
  }, { truncate: true });

  // Should have a DELETE before the INSERT
  const deleteLog = adapter.logs.find(l => l.sql.includes("DELETE FROM"));
  assert.ok(deleteLog, "Should have a DELETE statement for truncate");
  assert.ok(deleteLog!.sql.includes('"users"'));
});

// ============================================
// seed() — Transaction
// ============================================

test("seed — uses transaction by default", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await seed(db, {
    users: [
      { id: 1, name: "Alice", age: 25 },
    ],
  });

  // Should have BEGIN and COMMIT
  assert.ok(adapter.logs.some(l => l.sql === "BEGIN"), "Should have BEGIN");
  assert.ok(adapter.logs.some(l => l.sql === "COMMIT"), "Should have COMMIT");
});

test("seed — can skip transaction", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await seed(db, {
    users: [
      { id: 1, name: "Alice", age: 25 },
    ],
  }, { transaction: false });

  // Should NOT have BEGIN/COMMIT
  assert.ok(!adapter.logs.some(l => l.sql === "BEGIN"), "Should not have BEGIN");
});

// ============================================
// seed() — onSeed callback
// ============================================

test("seed — onSeed callback is called", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const calls: { table: string; count: number }[] = [];

  await seed(db, {
    users: [
      { id: 1, name: "Alice", age: 25 },
      { id: 2, name: "Bob", age: 30 },
    ],
    posts: [
      { id: 1, userId: 1, title: "Hello", content: "World" },
    ],
  }, {
    onSeed: (tableName, rowCount) => {
      calls.push({ table: tableName, count: rowCount });
    },
  });

  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(calls[0], { table: "users", count: 2 });
  assert.deepStrictEqual(calls[1], { table: "posts", count: 1 });
});

// ============================================
// createSeeder — Reusable Seeder
// ============================================

test("createSeeder — creates reusable seeder function", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const seeder = createSeeder(db, { validate: true, transaction: true });

  const result = await seeder({
    users: [
      { id: 1, name: "Alice", age: 25 },
    ],
  });

  assert.strictEqual(result.totalRows, 1);
});

test("createSeeder — per-call options override defaults", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const seeder = createSeeder(db, { validate: true });

  // Override with validate=false
  await assert.doesNotReject(
    () => seeder({
      users: [
        { id: "bad" } as any,
      ],
    }, { validate: false })
  );
});
