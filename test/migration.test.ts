import { test } from "node:test";
import assert from "node:assert";
import { DummyAdapter } from "../src/testing.js";
import { createMigrationRunner } from "../src/migration/runner.js";
import { Migrator } from "../src/migration/migrator.js";
import * as fs from "node:fs";
import * as path from "node:path";

// ============================================
// MigrationRunner Tests
// ============================================

test("MigrationRunner - createTable generates correct DDL", async () => {
  const adapter = new DummyAdapter();
  const runner = createMigrationRunner(adapter);

  await runner.createTable("users", {
    id: { type: Number, primaryKey: true },
    name: String,
    email: { type: String, nullable: true },
    isActive: { type: Boolean, default: true },
  });

  const logs = adapter.logs;
  assert.strictEqual(logs.length, 1);
  const sql = logs[0]!.sql;

  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS "users"'));
  assert.ok(sql.includes('"id" INTEGER PRIMARY KEY'));
  assert.ok(sql.includes('"name" TEXT NOT NULL'));
  assert.ok(sql.includes('"email" TEXT'));
  assert.ok(sql.includes('"isActive" BOOLEAN NOT NULL DEFAULT TRUE'));
});

test("MigrationRunner - dropTable generates correct DDL", async () => {
  const adapter = new DummyAdapter();
  const runner = createMigrationRunner(adapter);

  await runner.dropTable("users");

  const logs = adapter.logs;
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0]!.sql, 'DROP TABLE IF EXISTS "users" CASCADE;');
});

test("MigrationRunner - addColumn generates correct DDL", async () => {
  const adapter = new DummyAdapter();
  const runner = createMigrationRunner(adapter);

  await runner.addColumn("users", "age", Number);

  const logs = adapter.logs;
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(
    logs[0]!.sql,
    'ALTER TABLE "users" ADD COLUMN "age" INTEGER NOT NULL;'
  );
});

test("MigrationRunner - addColumn with nullable", async () => {
  const adapter = new DummyAdapter();
  const runner = createMigrationRunner(adapter);

  await runner.addColumn("users", "bio", { type: String, nullable: true });

  const logs = adapter.logs;
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(
    logs[0]!.sql,
    'ALTER TABLE "users" ADD COLUMN "bio" TEXT;'
  );
});

test("MigrationRunner - dropColumn generates correct DDL", async () => {
  const adapter = new DummyAdapter();
  const runner = createMigrationRunner(adapter);

  await runner.dropColumn("users", "age");

  const logs = adapter.logs;
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(
    logs[0]!.sql,
    'ALTER TABLE "users" DROP COLUMN "age";'
  );
});

test("MigrationRunner - renameTable generates correct DDL", async () => {
  const adapter = new DummyAdapter();
  const runner = createMigrationRunner(adapter);

  await runner.renameTable("users", "accounts");

  const logs = adapter.logs;
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(
    logs[0]!.sql,
    'ALTER TABLE "users" RENAME TO "accounts";'
  );
});

test("MigrationRunner - renameColumn generates correct DDL", async () => {
  const adapter = new DummyAdapter();
  const runner = createMigrationRunner(adapter);

  await runner.renameColumn("users", "name", "fullName");

  const logs = adapter.logs;
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(
    logs[0]!.sql,
    'ALTER TABLE "users" RENAME COLUMN "name" TO "fullName";'
  );
});

test("MigrationRunner - sql executes raw query", async () => {
  const adapter = new DummyAdapter();
  const runner = createMigrationRunner(adapter);

  await runner.sql("CREATE INDEX idx_users_email ON users(email)");

  const logs = adapter.logs;
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(
    logs[0]!.sql,
    "CREATE INDEX idx_users_email ON users(email)"
  );
});

test("MigrationRunner - sql with params", async () => {
  const adapter = new DummyAdapter();
  const runner = createMigrationRunner(adapter);

  await runner.sql("INSERT INTO settings VALUES ($1, $2)", ["key", "value"]);

  const logs = adapter.logs;
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0]!.sql, "INSERT INTO settings VALUES ($1, $2)");
  assert.deepStrictEqual(logs[0]!.params, ["key", "value"]);
});

// ============================================
// Migrator.make() Tests
// ============================================

test("Migrator.make() - creates migration file", async () => {
  const tmpDir = path.join(import.meta.dirname ?? ".", ".tmp_test_migrations");

  try {
    const migrator = new Migrator(null as any, { directory: tmpDir });
    const filePath = migrator.make("create_users");

    assert.ok(fs.existsSync(filePath));
    const content = fs.readFileSync(filePath, "utf-8");

    // Verify template content
    assert.ok(content.includes("async up(runner: MigrationRunner)"));
    assert.ok(content.includes("async down(runner: MigrationRunner)"));
    assert.ok(content.includes("import type { MigrationRunner }"));

    // Verify filename pattern: YYYYMMDDHHMMSS_create_users.ts
    const basename = path.basename(filePath);
    assert.ok(/^\d{14}_create_users\.ts$/.test(basename));
  } finally {
    // Cleanup
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
});

test("Migrator.make() - creates directory if not exists", async () => {
  const tmpDir = path.join(
    import.meta.dirname ?? ".",
    ".tmp_test_migrations_nested/deep/dir"
  );

  try {
    const migrator = new Migrator(null as any, { directory: tmpDir });
    const filePath = migrator.make("initial");

    assert.ok(fs.existsSync(filePath));
    assert.ok(fs.existsSync(tmpDir));
  } finally {
    const root = path.join(
      import.meta.dirname ?? ".",
      ".tmp_test_migrations_nested"
    );
    if (fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true });
    }
  }
});

// ============================================
// Migrator.listMigrationFiles() Tests
// ============================================

test("Migrator.listMigrationFiles() - returns sorted filenames", async () => {
  const tmpDir = path.join(
    import.meta.dirname ?? ".",
    ".tmp_test_list_migrations"
  );

  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "20260101000000_first.ts"), "");
    fs.writeFileSync(path.join(tmpDir, "20260102000000_second.ts"), "");
    fs.writeFileSync(path.join(tmpDir, "20260103000000_third.js"), "");
    fs.writeFileSync(path.join(tmpDir, "readme.md"), ""); // Should be ignored
    fs.writeFileSync(path.join(tmpDir, "types.d.ts"), ""); // Should be ignored

    const migrator = new Migrator(null as any, { directory: tmpDir });
    const files = migrator.listMigrationFiles();

    assert.deepStrictEqual(files, [
      "20260101000000_first",
      "20260102000000_second",
      "20260103000000_third",
    ]);
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
});

test("Migrator.listMigrationFiles() - returns empty for missing directory", async () => {
  const migrator = new Migrator(null as any, {
    directory: "/nonexistent/path",
  });
  const files = migrator.listMigrationFiles();
  assert.deepStrictEqual(files, []);
});
