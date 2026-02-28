
import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { DummyAdapter } from "../src/testing.js";

const schema = {
  users: {
    id: Number,
    name: String,
    email: String,
    deleted_at: { type: Date, nullable: true },
  },
  posts: {
    id: Number,
    title: String,
    userId: Number,
    deleted_at: { type: Date, nullable: true },
  },
  tags: {
    id: Number,
    name: String,
    // No deleted_at — soft delete NOT enabled
  }
};

// ============================================
// Default Behavior (auto-filter deleted rows)
// ============================================

test("Soft Delete - SELECT auto-excludes soft-deleted rows", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users', 'posts'] },
  });

  await db.query('users').execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "deleted_at" IS NULL');
  assert.deepStrictEqual(lastLog.params, []);
});

test("Soft Delete - SELECT with WHERE auto-appends deleted_at IS NULL", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('users').where({ name: 'Alice' }).execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "name" = $1 AND "deleted_at" IS NULL');
  assert.deepStrictEqual(lastLog.params, ['Alice']);
});

test("Soft Delete - non-soft-delete table is unaffected", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('tags').execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT * FROM "tags"');
});

// ============================================
// .withTrashed()
// ============================================

test("Soft Delete - withTrashed() includes all rows", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('users').withTrashed().execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT * FROM "users"');
});

test("Soft Delete - withTrashed() with WHERE", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('users').where({ name: 'Alice' }).withTrashed().execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "name" = $1');
  assert.deepStrictEqual(lastLog.params, ['Alice']);
});

// ============================================
// .onlyTrashed()
// ============================================

test("Soft Delete - onlyTrashed() returns only soft-deleted rows", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('users').onlyTrashed().execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "deleted_at" IS NOT NULL');
});

test("Soft Delete - onlyTrashed() with WHERE", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('users').where({ name: 'Alice' }).onlyTrashed().execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "name" = $1 AND "deleted_at" IS NOT NULL');
  assert.deepStrictEqual(lastLog.params, ['Alice']);
});

// ============================================
// .softDelete()
// ============================================

test("Soft Delete - softDelete() generates UPDATE with deleted_at", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('users').where({ id: 1 }).softDelete().execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.ok(lastLog.sql.startsWith('UPDATE "users" SET "deleted_at" = $1 WHERE "id" = $2'));
  assert.strictEqual(lastLog.params[1], 1);
  assert.ok(lastLog.params[0] instanceof Date);
  // Should also include soft delete filter (only delete non-trashed)
  assert.ok(lastLog.sql.includes('AND "deleted_at" IS NULL'));
});

test("Soft Delete - softDelete() with RETURNING", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('users').where({ id: 1 }).softDelete().returning('id').execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.ok(lastLog.sql.includes('RETURNING "id"'));
});

// ============================================
// .restore()
// ============================================

test("Soft Delete - restore() sets deleted_at to NULL", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('users').where({ id: 1 }).restore().execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.ok(lastLog.sql.startsWith('UPDATE "users" SET "deleted_at" = $1 WHERE "id" = $2'));
  assert.strictEqual(lastLog.params[0], null);
  assert.strictEqual(lastLog.params[1], 1);
  // Restore should target trashed rows (IS NOT NULL)
  assert.ok(lastLog.sql.includes('AND "deleted_at" IS NOT NULL'));
});

// ============================================
// Custom column name
// ============================================

test("Soft Delete - custom column name", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'], column: 'removed_at' },
  });

  await db.query('users').execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "removed_at" IS NULL');
});

test("Soft Delete - custom column name with onlyTrashed", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'], column: 'removed_at' },
  });

  await db.query('users').onlyTrashed().execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "removed_at" IS NOT NULL');
});

// ============================================
// Error Cases
// ============================================

test("Soft Delete - softDelete() throws when not enabled", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await assert.rejects(async () => {
    await db.query('users').where({ id: 1 }).softDelete().execute();
  }, /Soft delete is not enabled/);
});

test("Soft Delete - restore() throws when not enabled", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  await assert.rejects(async () => {
    await db.query('users').where({ id: 1 }).restore().execute();
  }, /Soft delete is not enabled/);
});

// ============================================
// .count() with soft delete
// ============================================

test("Soft Delete - count() excludes soft-deleted rows", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('users').count();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT COUNT(*) FROM "users" WHERE "deleted_at" IS NULL');
});

test("Soft Delete - count() with withTrashed() counts all rows", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('users').withTrashed().count();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT COUNT(*) FROM "users"');
});

// ============================================
// .first() with soft delete
// ============================================

test("Soft Delete - first() excludes soft-deleted rows", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('users').where({ id: 1 }).first();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(lastLog.sql, 'SELECT * FROM "users" WHERE "id" = $1 AND "deleted_at" IS NULL LIMIT 1');
  assert.deepStrictEqual(lastLog.params, [1]);
});

// ============================================
// Multiple tables with soft delete
// ============================================

test("Soft Delete - works independently per table", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users', 'posts'] },
  });

  await db.query('users').execute();
  await db.query('posts').execute();
  await db.query('tags').execute();

  const usersLog = adapter.logs[0]!;
  const postsLog = adapter.logs[1]!;
  const tagsLog = adapter.logs[2]!;

  assert.strictEqual(usersLog.sql, 'SELECT * FROM "users" WHERE "deleted_at" IS NULL');
  assert.strictEqual(postsLog.sql, 'SELECT * FROM "posts" WHERE "deleted_at" IS NULL');
  assert.strictEqual(tagsLog.sql, 'SELECT * FROM "tags"');
});

// ============================================
// Transaction preserves soft delete config
// ============================================

test("Soft Delete - transaction preserves config", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.transaction(async (tx) => {
    await tx.query('users').execute();
  });

  // Find the SELECT query (skip BEGIN/COMMIT)
  const selectLog = adapter.logs.find(l => l.sql.startsWith('SELECT'));
  assert.ok(selectLog);
  assert.strictEqual(selectLog.sql, 'SELECT * FROM "users" WHERE "deleted_at" IS NULL');
});

// ============================================
// Hard delete still works with .delete()
// ============================================

test("Soft Delete - hard delete with .delete() still works", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter, {
    softDelete: { tables: ['users'] },
  });

  await db.query('users').delete().where({ id: 1 }).execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.ok(lastLog.sql.startsWith('DELETE FROM "users"'));
  assert.ok(lastLog.sql.includes('WHERE "id" = $1'));
});
