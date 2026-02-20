
import { test, expect } from "bun:test";
import { createDB } from "../src/core/database";
import { DummyAdapter } from "../src/adapters/dummy";

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
  expect(logs.length).toBe(1);
  
  const sql = logs[0].sql;
  
  // Basic structure
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS users");
  
  // Columns
  expect(sql).toContain("id INTEGER PRIMARY KEY");
  expect(sql).toContain("name TEXT NOT NULL");
  expect(sql).toContain("email TEXT"); // nullable, so no NOT NULL
  expect(sql).not.toContain("email TEXT NOT NULL");
  
  // Defaults
  // By default columns are NOT NULL
  expect(sql).toContain("isActive BOOLEAN NOT NULL DEFAULT TRUE"); 
  expect(sql).toContain("score INTEGER NOT NULL DEFAULT 0");
});

test("DDL Generation - multiple tables", async () => {
    const adapter = new DummyAdapter();
    const db = createDB({
        users: { id: { type: Number, primaryKey: true } },
        posts: { id: { type: Number, primaryKey: true }, userId: Number }
    }, adapter);

    await db.createTables();
    expect(adapter.logs.length).toBe(2);
    expect(adapter.logs[0].sql).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(adapter.logs[1].sql).toContain("CREATE TABLE IF NOT EXISTS posts");
});
