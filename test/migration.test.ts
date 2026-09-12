import { test } from "node:test";
import assert from "node:assert";
import { DummyAdapter } from "../src/testing.js";
import { createMigrationRunner } from "../src/migration/runner.js";
import { Migrator } from "../src/migration/migrator.js";

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
// Migrator — Pure Runtime Inline Tests
// ============================================

// Helper to create a DummyAdapter that simulates the tracking table
class TrackingDummyAdapter extends DummyAdapter {
  // Simulated tracking table rows
  private _rows: any[] = [];
  private _batchCounter = 0;

  async query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    // Intercept tracking-table queries to simulate real DB
    if (sql.includes('CREATE TABLE IF NOT EXISTS "pawql_migrations"') || sql.includes('CREATE TABLE IF NOT EXISTS "custom_migrations"')) {
      // Call parent to log, but return success
      await super.query(sql, params);
      return { rows: [] as T[], rowCount: 0 };
    }
    if (sql.includes('SELECT * FROM "pawql_migrations"') || sql.includes('SELECT * FROM "custom_migrations"')) {
      // Check if filtering by batch
      if (sql.includes('WHERE "batch" = $1')) {
        const batch = params?.[0];
        const filtered = this._rows.filter((r) => r.batch === batch);
        // ORDER BY "name" DESC for down()
        filtered.sort((a, b) => b.name.localeCompare(a.name));
        return { rows: filtered as T[], rowCount: filtered.length };
      }
      // getExecuted — ORDER BY "name" ASC
      const sorted = [...this._rows].sort((a, b) => a.name.localeCompare(b.name));
      return { rows: sorted as T[], rowCount: sorted.length };
    }
    if (sql.includes('SELECT COALESCE(MAX("batch")')) {
      const max = this._rows.length > 0 ? Math.max(...this._rows.map((r) => r.batch)) : 0;
      return { rows: [{ max } as any as T], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO "pawql_migrations"') || sql.includes('INSERT INTO "custom_migrations"')) {
      const [name, batch] = params as [string, number];
      this._rows.push({ id: this._rows.length + 1, name, batch, executed_at: new Date() });
      await super.query(sql, params);
      return { rows: [] as T[], rowCount: 1 };
    }
    if (sql.includes('DELETE FROM "pawql_migrations"') || sql.includes('DELETE FROM "custom_migrations"')) {
      const [name] = params as [string];
      this._rows = this._rows.filter((r) => r.name !== name);
      await super.query(sql, params);
      return { rows: [] as T[], rowCount: 1 };
    }
    // For all other queries (migration DDL), delegate to parent (logs)
    return super.query(sql, params);
  }
}

test("Migrator constructor — throws if migrations not provided", () => {
  assert.throws(() => {
    new Migrator(null as any, null as any);
  }, /migrations: Migration\[\]/);
  assert.throws(() => {
    new Migrator(null as any, {} as any);
  }, /migrations: Migration\[\]/);
  assert.throws(() => {
    new Migrator(null as any, { migrations: null as any });
  }, /migrations: Migration\[\]/);
});

test("Migrator constructor — throws on duplicate migration name", () => {
  assert.throws(() => {
    new Migrator(null as any, {
      migrations: [
        { name: "dup", async up() {}, async down() {} },
        { name: "dup", async up() {}, async down() {} },
      ],
    });
  }, /Duplicate migration name: "dup"/);
});

test("Migrator constructor — throws on missing name or up/down", () => {
  assert.throws(() => {
    new Migrator(null as any, {
      migrations: [{ name: "", async up() {}, async down() {} } as any],
    });
  }, /unique `name: string`/);
  assert.throws(() => {
    new Migrator(null as any, {
      migrations: [{ name: "bad", async up() {} } as any],
    });
  }, /must have "up" and "down"/);
});

test("Migrator.getPending() — returns pending in array order", async () => {
  const adapter = new TrackingDummyAdapter();
  // Pre-populate executed: first migration already applied
  (adapter as any)._rows = [{ id: 1, name: "20260101_first", batch: 1, executed_at: new Date() }];

  const migrator = new Migrator(adapter, {
    migrations: [
      { name: "20260101_first", async up() {}, async down() {} },
      { name: "20260102_second", async up() {}, async down() {} },
      { name: "20260103_third", async up() {}, async down() {} },
    ],
  });

  const pending = await migrator.getPending();
  assert.deepStrictEqual(pending, ["20260102_second", "20260103_third"]);
});

test("Migrator.getPending() — returns empty when all applied", async () => {
  const adapter = new TrackingDummyAdapter();
  (adapter as any)._rows = [
    { id: 1, name: "a", batch: 1, executed_at: new Date() },
    { id: 2, name: "b", batch: 1, executed_at: new Date() },
  ];
  const migrator = new Migrator(adapter, {
    migrations: [
      { name: "a", async up() {}, async down() {} },
      { name: "b", async up() {}, async down() {} },
    ],
  });
  const pending = await migrator.getPending();
  assert.deepStrictEqual(pending, []);
});

test("Migrator.up() — applies pending in order and records batch", async () => {
  const adapter = new TrackingDummyAdapter();
  const order: string[] = [];

  const migrator = new Migrator(adapter, {
    migrations: [
      {
        name: "20260101_first",
        async up(runner) { order.push("first"); await runner.sql("SELECT 1"); },
        async down() { order.push("down-first"); },
      },
      {
        name: "20260102_second",
        async up(runner) { order.push("second"); await runner.sql("SELECT 2"); },
        async down() { order.push("down-second"); },
      },
    ],
  });

  const applied = await migrator.up();
  assert.deepStrictEqual(applied, ["20260101_first", "20260102_second"]);
  assert.deepStrictEqual(order, ["first", "second"]);
  // Both should be in same batch (1)
  assert.strictEqual((adapter as any)._rows[0].batch, 1);
  assert.strictEqual((adapter as any)._rows[1].batch, 1);
});

test("Migrator.up() — second up creates new batch", async () => {
  const adapter = new TrackingDummyAdapter();
  const migrator = new Migrator(adapter, {
    migrations: [
      { name: "a", async up(r) { await r.sql("SELECT 1"); }, async down() {} },
      { name: "b", async up(r) { await r.sql("SELECT 2"); }, async down() {} },
    ],
  });

  await migrator.up(); // batch 1: a, b

  // Add new migration dynamically (simulate user appending to array and constructing new Migrator)
  const migrator2 = new Migrator(adapter, {
    migrations: [
      { name: "a", async up(r) { await r.sql("SELECT 1"); }, async down() {} },
      { name: "b", async up(r) { await r.sql("SELECT 2"); }, async down() {} },
      { name: "c", async up(r) { await r.sql("SELECT 3"); }, async down() {} },
    ],
  });

  const applied2 = await migrator2.up();
  assert.deepStrictEqual(applied2, ["c"]);
  assert.strictEqual((adapter as any)._rows.find((r: any) => r.name === "c").batch, 2);
});

test("Migrator.up() — returns empty when no pending", async () => {
  const adapter = new TrackingDummyAdapter();
  (adapter as any)._rows = [{ id: 1, name: "a", batch: 1, executed_at: new Date() }];
  const migrator = new Migrator(adapter, {
    migrations: [{ name: "a", async up() {}, async down() {} }],
  });
  const applied = await migrator.up();
  assert.deepStrictEqual(applied, []);
});

test("Migrator.down() — rolls back last batch in reverse order", async () => {
  const adapter = new TrackingDummyAdapter();
  const order: string[] = [];

  const migrator = new Migrator(adapter, {
    migrations: [
      { name: "a", async up() {}, async down() { order.push("a"); } },
      { name: "b", async up() {}, async down() { order.push("b"); } },
      { name: "c", async up() {}, async down() { order.push("c"); } },
    ],
  });

  // Simulate: batch 1 had a,b ; batch 2 had c
  (adapter as any)._rows = [
    { id: 1, name: "a", batch: 1, executed_at: new Date() },
    { id: 2, name: "b", batch: 1, executed_at: new Date() },
    { id: 3, name: "c", batch: 2, executed_at: new Date() },
  ];

  const rolledBack = await migrator.down();
  // Should rollback only batch 2 (c)
  assert.deepStrictEqual(rolledBack, ["c"]);
  assert.deepStrictEqual(order, ["c"]);
  assert.strictEqual((adapter as any)._rows.length, 2);

  // Second down should rollback batch 1 in reverse (b, a) because ORDER BY name DESC
  order.length = 0;
  const rolledBack2 = await migrator.down();
  assert.deepStrictEqual(rolledBack2, ["b", "a"]);
  assert.deepStrictEqual(order, ["b", "a"]);
  assert.strictEqual((adapter as any)._rows.length, 0);
});

test("Migrator.down() — returns empty when no batches", async () => {
  const adapter = new TrackingDummyAdapter();
  const migrator = new Migrator(adapter, {
    migrations: [{ name: "a", async up() {}, async down() {} }],
  });
  const rolledBack = await migrator.down();
  assert.deepStrictEqual(rolledBack, []);
});

test("Migrator.down() — throws if migration not found in array", async () => {
  const adapter = new TrackingDummyAdapter();
  (adapter as any)._rows = [{ id: 1, name: "old_migration", batch: 1, executed_at: new Date() }];
  const migrator = new Migrator(adapter, {
    migrations: [{ name: "new_migration", async up() {}, async down() {} }],
  });
  await assert.rejects(() => migrator.down(), /not found in provided migrations array/);
});

test("Migrator custom tableName", async () => {
  const adapter = new TrackingDummyAdapter();
  const migrator = new Migrator(adapter, {
    migrations: [{ name: "a", async up(r) { await r.sql("SELECT 1"); }, async down() {} }],
    tableName: "custom_migrations",
  });
  const applied = await migrator.up();
  assert.deepStrictEqual(applied, ["a"]);
  assert.strictEqual((adapter as any)._rows[0].name, "a");
});
