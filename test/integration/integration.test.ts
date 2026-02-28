/**
 * PawQL Integration Tests
 * 
 * These tests run against a real PostgreSQL database (via Docker).
 * When PostgreSQL is not available, all tests are gracefully skipped.
 * 
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 * 
 * Run:
 *   npx tsx --test test/integration/integration.test.ts
 * 
 * Cleanup:
 *   docker compose -f docker-compose.test.yml down
 */

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import { createDB } from "../../src/core/database.js";
import { PostgresAdapter } from "../../src/adapters/pg.js";
import { uuid, json, enumType, arrayType } from "../../src/types/schema.js";

// ============================================
// Test Configuration
// ============================================

const TEST_CONNECTION = {
  host: "localhost",
  port: 5433,
  database: "pawql_test",
  user: "pawql_test",
  password: "pawql_test_pass",
};

// Schema used across tests
const schema = {
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    email: { type: String, nullable: true },
    age: Number,
    is_active: { type: Boolean, default: true },
    deleted_at: { type: Date, nullable: true },
  },
  posts: {
    id: { type: Number, primaryKey: true },
    user_id: Number,
    title: String,
    content: { type: String, nullable: true },
    status: enumType("draft", "published", "archived"),
    tags: arrayType(String),
    metadata: json<{ views?: number; featured?: boolean }>(),
    created_at: Date,
    deleted_at: { type: Date, nullable: true },
  },
  categories: {
    id: { type: Number, primaryKey: true },
    name: String,
    slug: String,
  },
};

// ============================================
// Connection check — skip all tests if no DB
// ============================================

let canConnect = false;

try {
  const testAdapter = new PostgresAdapter(TEST_CONNECTION);
  await testAdapter.query("SELECT 1");
  await testAdapter.close();
  canConnect = true;
} catch {
  console.log("\n⏭️  Skipping integration tests — PostgreSQL is not running.");
  console.log("   Start it with: docker compose -f docker-compose.test.yml up -d\n");
}

// ============================================
// Guard — skip ALL tests if no DB available
// ============================================

const SKIP_REASON = "PostgreSQL not available (run: docker compose -f docker-compose.test.yml up -d)";

if (!canConnect) {
  test("Integration tests skipped — PostgreSQL not available", { skip: SKIP_REASON }, () => {});
} else {

// ============================================
// Test Lifecycle
// ============================================

let adapter: PostgresAdapter;
let db: ReturnType<typeof createDB<typeof schema>>;
let dbSoftDelete: ReturnType<typeof createDB<typeof schema>>;

async function resetDatabase() {
  await adapter.query("DROP TABLE IF EXISTS posts CASCADE");
  await adapter.query("DROP TABLE IF EXISTS users CASCADE");
  await adapter.query("DROP TABLE IF EXISTS categories CASCADE");
}

async function seedUsers() {
  await db.query("users").insert([
    { id: 1, name: "Alice", email: "alice@test.com", age: 28, is_active: true, deleted_at: null as any },
    { id: 2, name: "Bob", email: "bob@test.com", age: 35, is_active: true, deleted_at: null as any },
    { id: 3, name: "Charlie", email: null as any, age: 22, is_active: false, deleted_at: null as any },
    { id: 4, name: "Diana", email: "diana@test.com", age: 30, is_active: true, deleted_at: null as any },
    { id: 5, name: "Eve", email: "eve@test.com", age: 45, is_active: false, deleted_at: null as any },
  ]).returning(false).execute();
}

before(async () => {
  adapter = new PostgresAdapter(TEST_CONNECTION);
  db = createDB(schema, adapter);
  dbSoftDelete = createDB(schema, adapter, {
    softDelete: { tables: ["users", "posts"] },
  });

  await resetDatabase();
  await db.createTables();
});

after(async () => {
  await resetDatabase();
  await adapter.close();
});

// ============================================
// DDL / Create Tables
// ============================================

describe("Integration: DDL", () => {
  test("createTables() creates tables from schema", async () => {
    const result = await adapter.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' 
       ORDER BY table_name`
    );
    const tableNames = result.rows.map((r) => r.table_name);
    assert.ok(tableNames.includes("users"));
    assert.ok(tableNames.includes("posts"));
    assert.ok(tableNames.includes("categories"));
  });

  test("tables have correct column types", async () => {
    const result = await adapter.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT column_name, data_type, is_nullable 
       FROM information_schema.columns 
       WHERE table_name = 'users' 
       ORDER BY ordinal_position`
    );

    const cols = Object.fromEntries(
      result.rows.map((r) => [r.column_name, r])
    );

    assert.strictEqual(cols["id"]!.data_type, "integer");
    assert.strictEqual(cols["name"]!.data_type, "text");
    assert.strictEqual(cols["email"]!.is_nullable, "YES");
    assert.strictEqual(cols["age"]!.data_type, "integer");
    assert.strictEqual(cols["is_active"]!.data_type, "boolean");
  });
});

// ============================================
// INSERT
// ============================================

describe("Integration: INSERT", () => {
  beforeEach(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
  });

  test("insert single row", async () => {
    const result = await db
      .query("users")
      .insert({
        id: 1,
        name: "Alice",
        email: "alice@test.com",
        age: 28,
        is_active: true,
        deleted_at: null as any,
      })
      .execute();

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.name, "Alice");
    assert.strictEqual(result[0]!.email, "alice@test.com");
    assert.strictEqual(result[0]!.age, 28);
  });

  test("insert multiple rows", async () => {
    const result = await db
      .query("users")
      .insert([
        { id: 1, name: "Alice", email: "alice@test.com", age: 28, is_active: true, deleted_at: null as any },
        { id: 2, name: "Bob", email: "bob@test.com", age: 35, is_active: true, deleted_at: null as any },
      ])
      .execute();

    assert.strictEqual(result.length, 2);
  });

  test("insert with RETURNING specific columns", async () => {
    const result = await db
      .query("users")
      .insert({
        id: 1,
        name: "Alice",
        email: "alice@test.com",
        age: 28,
        is_active: true,
        deleted_at: null as any,
      })
      .returning("id", "name")
      .execute();

    assert.strictEqual(result.length, 1);
    assert.ok("id" in result[0]!);
    assert.ok("name" in result[0]!);
  });

  test("insert with RETURNING false", async () => {
    const result = await db
      .query("users")
      .insert({
        id: 1,
        name: "Alice",
        email: "alice@test.com",
        age: 28,
        is_active: true,
        deleted_at: null as any,
      })
      .returning(false)
      .execute();

    assert.strictEqual(result.length, 0);
  });

  test("insert with advanced types", async () => {
    await seedUsers();

    const now = new Date();
    const result = await db.query("posts").insert({
      id: 1,
      user_id: 1,
      title: "Hello World",
      content: "First post content",
      status: "published" as any,
      tags: ["typescript", "orm"] as any,
      metadata: { views: 100, featured: true } as any,
      created_at: now,
      deleted_at: null as any,
    }).execute();

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.title, "Hello World");
    assert.deepStrictEqual(result[0]!.tags, ["typescript", "orm"]);
    assert.deepStrictEqual(result[0]!.metadata, { views: 100, featured: true });
  });
});

// ============================================
// SELECT
// ============================================

describe("Integration: SELECT", () => {
  before(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();
  });

  test("select all rows", async () => {
    const users = await db.query("users").execute();
    assert.strictEqual(users.length, 5);
  });

  test("select specific columns", async () => {
    const users = await db.query("users").select("id", "name").execute();
    assert.strictEqual(users.length, 5);
    assert.ok("id" in users[0]!);
    assert.ok("name" in users[0]!);
  });

  test(".first() returns single row", async () => {
    const user = await db.query("users").where({ id: 1 }).first();
    assert.ok(user !== null);
    assert.strictEqual(user.name, "Alice");
  });

  test(".first() returns null when no match", async () => {
    const user = await db.query("users").where({ id: 999 }).first();
    assert.strictEqual(user, null);
  });

  test(".count() returns number", async () => {
    const total = await db.query("users").count();
    assert.strictEqual(total, 5);
  });
});

// ============================================
// WHERE Filtering
// ============================================

describe("Integration: WHERE", () => {
  before(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();
  });

  test("exact match", async () => {
    const users = await db.query("users").where({ name: "Alice" }).execute();
    assert.strictEqual(users.length, 1);
    assert.strictEqual(users[0]!.name, "Alice");
  });

  test("comparison: gt", async () => {
    const users = await db.query("users").where({ age: { gt: 30 } }).execute();
    assert.ok(users.length >= 2);
    assert.ok(users.every((u) => u.age > 30));
  });

  test("comparison: lt", async () => {
    const users = await db.query("users").where({ age: { lt: 25 } }).execute();
    assert.ok(users.length >= 1);
    assert.ok(users.every((u) => u.age < 25));
  });

  test("comparison: gte / lte", async () => {
    const users = await db
      .query("users")
      .where({ age: { gte: 28 } })
      .where({ age: { lte: 35 } })
      .execute();
    assert.ok(users.every((u) => u.age >= 28 && u.age <= 35));
  });

  test("BETWEEN", async () => {
    const users = await db
      .query("users")
      .where({ age: { between: [25, 35] } })
      .execute();
    assert.ok(users.length >= 3);
    assert.ok(users.every((u) => u.age >= 25 && u.age <= 35));
  });

  test("IN", async () => {
    const users = await db
      .query("users")
      .where({ name: { in: ["Alice", "Bob"] } })
      .execute();
    assert.strictEqual(users.length, 2);
  });

  test("NOT IN", async () => {
    const users = await db
      .query("users")
      .where({ name: { notIn: ["Alice", "Bob"] } })
      .execute();
    assert.strictEqual(users.length, 3);
  });

  test("LIKE", async () => {
    const users = await db
      .query("users")
      .where({ name: { like: "%li%" } })
      .execute();
    assert.ok(users.length >= 1);
    assert.ok(users.some((u) => u.name === "Alice" || u.name === "Charlie"));
  });

  test("ILIKE (case-insensitive)", async () => {
    const users = await db
      .query("users")
      .where({ name: { ilike: "%alice%" } })
      .execute();
    assert.strictEqual(users.length, 1);
    assert.strictEqual(users[0]!.name, "Alice");
  });

  test("IS NULL", async () => {
    const users = await db
      .query("users")
      .where({ email: null })
      .execute();
    assert.strictEqual(users.length, 1);
    assert.strictEqual(users[0]!.name, "Charlie");
  });

  test("NOT equal", async () => {
    const users = await db
      .query("users")
      .where({ name: { not: "Alice" } })
      .execute();
    assert.strictEqual(users.length, 4);
    assert.ok(!users.some((u) => u.name === "Alice"));
  });

  test("OR conditions", async () => {
    const users = await db
      .query("users")
      .where({ name: "Alice" })
      .orWhere({ name: "Bob" })
      .execute();
    assert.strictEqual(users.length, 2);
  });

  test(".count() with WHERE", async () => {
    const count = await db
      .query("users")
      .where({ is_active: true })
      .count();
    assert.strictEqual(count, 3);
  });
});

// ============================================
// ORDER BY
// ============================================

describe("Integration: ORDER BY", () => {
  before(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();
  });

  test("ASC order", async () => {
    const users = await db
      .query("users")
      .orderBy("age", "ASC")
      .execute();
    for (let i = 1; i < users.length; i++) {
      assert.ok(users[i]!.age >= users[i - 1]!.age);
    }
  });

  test("DESC order", async () => {
    const users = await db
      .query("users")
      .orderBy("age", "DESC")
      .execute();
    for (let i = 1; i < users.length; i++) {
      assert.ok(users[i]!.age <= users[i - 1]!.age);
    }
  });

  test("multiple orderBy", async () => {
    const users = await db
      .query("users")
      .orderBy("is_active", "DESC")
      .orderBy("age", "ASC")
      .execute();
    assert.strictEqual(users.length, 5);
  });
});

// ============================================
// LIMIT / OFFSET
// ============================================

describe("Integration: LIMIT / OFFSET", () => {
  before(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();
  });

  test("LIMIT", async () => {
    const users = await db.query("users").limit(2).execute();
    assert.strictEqual(users.length, 2);
  });

  test("LIMIT + OFFSET", async () => {
    const page1 = await db
      .query("users")
      .orderBy("id", "ASC")
      .limit(2)
      .execute();
    const page2 = await db
      .query("users")
      .orderBy("id", "ASC")
      .limit(2)
      .offset(2)
      .execute();

    assert.strictEqual(page1.length, 2);
    assert.strictEqual(page2.length, 2);
    assert.notStrictEqual(page1[0]!.id, page2[0]!.id);
  });
});

// ============================================
// UPDATE
// ============================================

describe("Integration: UPDATE", () => {
  beforeEach(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();
  });

  test("update with WHERE", async () => {
    const result = await db
      .query("users")
      .update({ name: "Alice Updated" })
      .where({ id: 1 })
      .execute();

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.name, "Alice Updated");

    // Verify the update persisted
    const user = await db.query("users").where({ id: 1 }).first();
    assert.strictEqual(user!.name, "Alice Updated");
  });

  test("update multiple fields", async () => {
    const result = await db
      .query("users")
      .update({ name: "Bob Updated", age: 36 })
      .where({ id: 2 })
      .execute();

    assert.strictEqual(result[0]!.name, "Bob Updated");
    assert.strictEqual(result[0]!.age, 36);
  });

  test("update with RETURNING specific columns", async () => {
    const result = await db
      .query("users")
      .update({ name: "Updated" })
      .where({ id: 1 })
      .returning("id", "name")
      .execute();

    assert.ok("id" in result[0]!);
    assert.ok("name" in result[0]!);
  });
});

// ============================================
// DELETE
// ============================================

describe("Integration: DELETE", () => {
  beforeEach(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();
  });

  test("delete with WHERE", async () => {
    const result = await db
      .query("users")
      .delete()
      .where({ id: 5 })
      .execute();

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.name, "Eve");

    const count = await db.query("users").count();
    assert.strictEqual(count, 4);
  });

  test("delete with RETURNING false", async () => {
    const result = await db
      .query("users")
      .delete()
      .where({ id: 5 })
      .returning(false)
      .execute();

    assert.strictEqual(result.length, 0);
  });
});

// ============================================
// Upsert (ON CONFLICT)
// ============================================

describe("Integration: Upsert", () => {
  beforeEach(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();
  });

  test("ON CONFLICT DO NOTHING", async () => {
    // Insert duplicate ID = 1 (Alice)
    const result = await db
      .query("users")
      .insert({
        id: 1,
        name: "Duplicate Alice",
        email: "dup@test.com",
        age: 99,
        is_active: true,
        deleted_at: null as any,
      })
      .onConflict("id")
      .doNothing()
      .returning(false)
      .execute();

    assert.strictEqual(result.length, 0);

    // Verify original is unchanged
    const user = await db.query("users").where({ id: 1 }).first();
    assert.strictEqual(user!.name, "Alice");
  });

  test("ON CONFLICT DO UPDATE", async () => {
    await db
      .query("users")
      .insert({
        id: 1,
        name: "Duplicate Alice",
        email: "dup@test.com",
        age: 99,
        is_active: true,
        deleted_at: null as any,
      })
      .onConflict("id")
      .doUpdate({ name: "Alice Upserted", age: 29 })
      .returning(false)
      .execute();

    const user = await db.query("users").where({ id: 1 }).first();
    assert.strictEqual(user!.name, "Alice Upserted");
    assert.strictEqual(user!.age, 29);
  });
});

// ============================================
// Joins
// ============================================

describe("Integration: JOINs", () => {
  before(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();

    const now = new Date();
    await db.query("posts").insert([
      { id: 1, user_id: 1, title: "Alice Post 1", content: "Content 1", status: "published" as any, tags: ["ts"] as any, metadata: {} as any, created_at: now, deleted_at: null as any },
      { id: 2, user_id: 1, title: "Alice Post 2", content: "Content 2", status: "draft" as any, tags: ["js"] as any, metadata: {} as any, created_at: now, deleted_at: null as any },
      { id: 3, user_id: 2, title: "Bob Post 1", content: "Content 3", status: "published" as any, tags: ["sql"] as any, metadata: {} as any, created_at: now, deleted_at: null as any },
    ]).returning(false).execute();
  });

  test("INNER JOIN", async () => {
    const results = await db
      .query("users")
      .select("users.name", "posts.title")
      .innerJoin("posts", "users.id", "=", "posts.user_id")
      .execute();

    assert.strictEqual(results.length, 3);
  });

  test("LEFT JOIN", async () => {
    const results = await db
      .query("users")
      .select("users.name", "posts.title")
      .leftJoin("posts", "users.id", "=", "posts.user_id")
      .execute();

    // All users are included, even those without posts
    assert.ok(results.length >= 5);
  });

  test("JOIN with WHERE", async () => {
    const results = await db
      .query("users")
      .select("users.name", "posts.title")
      .innerJoin("posts", "users.id", "=", "posts.user_id")
      .where({ "posts.status": "published" })
      .execute();

    assert.ok(results.length >= 2);
  });
});

// ============================================
// Transactions
// ============================================

describe("Integration: Transactions", () => {
  beforeEach(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();
  });

  test("commit on success", async () => {
    await db.transaction(async (tx) => {
      await tx.query("users").insert({
        id: 100,
        name: "Transaction User",
        email: "tx@test.com",
        age: 25,
        is_active: true,
        deleted_at: null as any,
      }).returning(false).execute();
    });

    const user = await db.query("users").where({ id: 100 }).first();
    assert.ok(user !== null);
    assert.strictEqual(user.name, "Transaction User");
  });

  test("rollback on error", async () => {
    try {
      await db.transaction(async (tx) => {
        await tx.query("users").insert({
          id: 200,
          name: "Rollback User",
          email: "rb@test.com",
          age: 25,
          is_active: true,
          deleted_at: null as any,
        }).returning(false).execute();

        throw new Error("Force rollback");
      });
    } catch {
      // Expected
    }

    const user = await db.query("users").where({ id: 200 }).first();
    assert.strictEqual(user, null);
  });

  test("multiple operations in single transaction", async () => {
    await db.transaction(async (tx) => {
      await tx.query("users").insert({
        id: 300,
        name: "Multi-Op User",
        email: "multi@test.com",
        age: 30,
        is_active: true,
        deleted_at: null as any,
      }).returning(false).execute();

      await tx
        .query("users")
        .update({ age: 31 })
        .where({ id: 300 })
        .returning(false)
        .execute();
    });

    const user = await db.query("users").where({ id: 300 }).first();
    assert.ok(user !== null);
    assert.strictEqual(user.age, 31);
  });
});

// ============================================
// GROUP BY + HAVING
// ============================================

describe("Integration: GROUP BY + HAVING", () => {
  before(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();

    const now = new Date();
    await db.query("posts").insert([
      { id: 1, user_id: 1, title: "P1", content: null as any, status: "published" as any, tags: [] as any, metadata: {} as any, created_at: now, deleted_at: null as any },
      { id: 2, user_id: 1, title: "P2", content: null as any, status: "draft" as any, tags: [] as any, metadata: {} as any, created_at: now, deleted_at: null as any },
      { id: 3, user_id: 1, title: "P3", content: null as any, status: "published" as any, tags: [] as any, metadata: {} as any, created_at: now, deleted_at: null as any },
      { id: 4, user_id: 2, title: "P4", content: null as any, status: "published" as any, tags: [] as any, metadata: {} as any, created_at: now, deleted_at: null as any },
    ]).returning(false).execute();
  });

  test("GROUP BY", async () => {
    const results = await db
      .query("posts")
      .select("user_id", "COUNT(*) as post_count")
      .groupBy("user_id")
      .orderBy("user_id", "ASC")
      .execute();

    assert.ok(results.length >= 2);
  });

  test("GROUP BY + HAVING", async () => {
    const results = await db
      .query("posts")
      .select("user_id", "COUNT(*) as post_count")
      .groupBy("user_id")
      .having("COUNT(*) > $1", 2)
      .execute();

    // Only user_id=1 has more than 2 posts
    assert.strictEqual(results.length, 1);
  });
});

// ============================================
// Raw SQL
// ============================================

describe("Integration: Raw SQL", () => {
  before(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();
  });

  test("raw query returns rows", async () => {
    const result = await db.raw<{ id: number; name: string }>(
      "SELECT id, name FROM users WHERE id = $1",
      [1]
    );

    assert.strictEqual(result.rows.length, 1);
    assert.strictEqual(result.rows[0]!.name, "Alice");
  });

  test("raw query without params", async () => {
    const result = await db.raw<{ now: Date }>("SELECT NOW() AS now");
    assert.ok(result.rows[0]!.now instanceof Date);
  });
});

// ============================================
// Soft Delete (Integration)
// ============================================

describe("Integration: Soft Delete", () => {
  beforeEach(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();
  });

  test("softDelete() sets deleted_at", async () => {
    await dbSoftDelete
      .query("users")
      .where({ id: 1 })
      .softDelete()
      .returning(false)
      .execute();

    // Direct query to verify deleted_at is set
    const result = await adapter.query<{ deleted_at: Date | null }>(
      "SELECT deleted_at FROM users WHERE id = $1",
      [1]
    );
    assert.ok(result.rows[0]!.deleted_at !== null);
  });

  test("default SELECT excludes soft-deleted rows", async () => {
    // Soft delete user 1
    await dbSoftDelete
      .query("users")
      .where({ id: 1 })
      .softDelete()
      .returning(false)
      .execute();

    // Default query should exclude deleted user
    const users = await dbSoftDelete.query("users").execute();
    assert.strictEqual(users.length, 4);
    assert.ok(!users.some((u) => u.id === 1));
  });

  test("withTrashed() includes soft-deleted rows", async () => {
    await dbSoftDelete
      .query("users")
      .where({ id: 1 })
      .softDelete()
      .returning(false)
      .execute();

    const users = await dbSoftDelete.query("users").withTrashed().execute();
    assert.strictEqual(users.length, 5);
    assert.ok(users.some((u) => u.id === 1));
  });

  test("onlyTrashed() returns only soft-deleted rows", async () => {
    await dbSoftDelete
      .query("users")
      .where({ id: 1 })
      .softDelete()
      .returning(false)
      .execute();

    await dbSoftDelete
      .query("users")
      .where({ id: 2 })
      .softDelete()
      .returning(false)
      .execute();

    const trashed = await dbSoftDelete.query("users").onlyTrashed().execute();
    assert.strictEqual(trashed.length, 2);
    assert.ok(trashed.some((u) => u.id === 1));
    assert.ok(trashed.some((u) => u.id === 2));
  });

  test("restore() sets deleted_at to NULL", async () => {
    // Soft delete then restore
    await dbSoftDelete
      .query("users")
      .where({ id: 1 })
      .softDelete()
      .returning(false)
      .execute();

    await dbSoftDelete
      .query("users")
      .where({ id: 1 })
      .restore()
      .returning(false)
      .execute();

    // User should be back in default queries
    const users = await dbSoftDelete.query("users").execute();
    assert.strictEqual(users.length, 5);
    assert.ok(users.some((u) => u.id === 1));

    // Verify deleted_at is null
    const result = await adapter.query<{ deleted_at: Date | null }>(
      "SELECT deleted_at FROM users WHERE id = $1",
      [1]
    );
    assert.strictEqual(result.rows[0]!.deleted_at, null);
  });

  test("count() respects soft delete", async () => {
    await dbSoftDelete
      .query("users")
      .where({ id: 1 })
      .softDelete()
      .returning(false)
      .execute();

    const count = await dbSoftDelete.query("users").count();
    assert.strictEqual(count, 4);

    const totalCount = await dbSoftDelete.query("users").withTrashed().count();
    assert.strictEqual(totalCount, 5);
  });

  test("first() respects soft delete", async () => {
    await dbSoftDelete
      .query("users")
      .where({ id: 1 })
      .softDelete()
      .returning(false)
      .execute();

    const user = await dbSoftDelete.query("users").where({ id: 1 }).first();
    assert.strictEqual(user, null);

    const userWithTrashed = await dbSoftDelete
      .query("users")
      .where({ id: 1 })
      .withTrashed()
      .first();
    assert.ok(userWithTrashed !== null);
    assert.strictEqual(userWithTrashed.name, "Alice");
  });

  test("hard delete still works", async () => {
    await dbSoftDelete
      .query("users")
      .delete()
      .where({ id: 5 })
      .returning(false)
      .execute();

    // Even withTrashed, the row is gone
    const users = await dbSoftDelete
      .query("users")
      .withTrashed()
      .execute();
    assert.strictEqual(users.length, 4);
    assert.ok(!users.some((u) => u.id === 5));
  });

  test("soft delete in transaction", async () => {
    await dbSoftDelete.transaction(async (tx) => {
      await tx
        .query("users")
        .where({ id: 1 })
        .softDelete()
        .returning(false)
        .execute();

      await tx
        .query("users")
        .where({ id: 2 })
        .softDelete()
        .returning(false)
        .execute();
    });

    const users = await dbSoftDelete.query("users").execute();
    assert.strictEqual(users.length, 3);
  });
});

// ============================================
// Advanced Data Types
// ============================================

describe("Integration: Advanced Types", () => {
  beforeEach(async () => {
    await adapter.query("DELETE FROM posts");
    await adapter.query("DELETE FROM users");
    await seedUsers();
  });

  test("JSONB column storage and retrieval", async () => {
    const now = new Date();
    await db.query("posts").insert({
      id: 1,
      user_id: 1,
      title: "JSON Test",
      content: null as any,
      status: "draft" as any,
      tags: [] as any,
      metadata: { views: 42, featured: true } as any,
      created_at: now,
      deleted_at: null as any,
    }).returning(false).execute();

    const post = await db.query("posts").where({ id: 1 }).first();
    assert.deepStrictEqual(post!.metadata, { views: 42, featured: true });
  });

  test("Array column storage and retrieval", async () => {
    const now = new Date();
    await db.query("posts").insert({
      id: 1,
      user_id: 1,
      title: "Array Test",
      content: null as any,
      status: "published" as any,
      tags: ["alpha", "beta", "gamma"] as any,
      metadata: {} as any,
      created_at: now,
      deleted_at: null as any,
    }).returning(false).execute();

    const post = await db.query("posts").where({ id: 1 }).first();
    assert.deepStrictEqual(post!.tags, ["alpha", "beta", "gamma"]);
  });

  test("Enum constraint enforcement", async () => {
    const now = new Date();
    await assert.rejects(async () => {
      await db.query("posts").insert({
        id: 1,
        user_id: 1,
        title: "Bad Enum",
        content: null as any,
        status: "invalid_status" as any,
        tags: [] as any,
        metadata: {} as any,
        created_at: now,
        deleted_at: null as any,
      }).execute();
    });
  });

  test("Nullable column accepts null", async () => {
    await db.query("users").insert({
      id: 100,
      name: "No Email",
      email: null as any,
      age: 20,
      is_active: true,
      deleted_at: null as any,
    }).returning(false).execute();

    const user = await db.query("users").where({ id: 100 }).first();
    assert.strictEqual(user!.email, null);
  });

  test("Boolean column storage", async () => {
    const activeUsers = await db
      .query("users")
      .where({ is_active: true })
      .execute();
    assert.ok(activeUsers.every((u) => u.is_active === true));

    const inactiveUsers = await db
      .query("users")
      .where({ is_active: false })
      .execute();
    assert.ok(inactiveUsers.every((u) => u.is_active === false));
  });
});

// ============================================
// Pool Management
// ============================================

describe("Integration: Pool", () => {
  test("pool statistics are accessible", () => {
    assert.ok(typeof adapter.poolSize === "number");
    assert.ok(typeof adapter.idleCount === "number");
    assert.ok(typeof adapter.waitingCount === "number");
  });
});

} // end if (canConnect)
