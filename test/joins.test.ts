
import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { DummyAdapter } from "../src/testing.js";

const schema = {
  users: {
    id: Number,
    name: String,
  },
  posts: {
    id: Number,
    user_id: Number,
    title: String,
  },
};

test("Joins - Inner Join generates correct SQL", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .innerJoin('posts', 'users.id', '=', 'posts.user_id')
        .where({ 'users.name': 'Alice' }) 
        // Note: For now keys in where object are treated as literals if string
        .select('users.name', 'posts.title')
        .execute();

    const logs = adapter.logs;
    const lastLog = logs[logs.length - 1]!;
    
    assert.ok(lastLog.sql.includes('INNER JOIN "posts" ON "users"."id" = "posts"."user_id"'));
    assert.ok(lastLog.sql.includes('WHERE "users"."name" = $1'));
    assert.ok(lastLog.sql.includes('SELECT "users"."name", "posts"."title" FROM "users"'));
});

test("Joins - Left Join generates correct SQL", async () => {
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    await db.query('users')
        .leftJoin('posts', 'users.id', '=', 'posts.user_id')
        .execute();

    const logs = adapter.logs;
    const lastLog = logs[logs.length - 1]!;
    
    assert.ok(lastLog.sql.includes('LEFT JOIN "posts" ON "users"."id" = "posts"."user_id"'));
});

test("Joins - Multiple Joins", async () => {
    const adapter = new DummyAdapter();
    const threeTableSchema = {
        ...schema,
        comments: {
            id: Number,
            post_id: Number,
            text: String
        }
    };
    const db = createDB(threeTableSchema, adapter);

    await db.query('users')
        .innerJoin('posts', 'users.id', '=', 'posts.user_id')
        .leftJoin('comments', 'posts.id', '=', 'comments.post_id')
        .execute();

    const logs = adapter.logs;
    const lastLog = logs[logs.length - 1]!;
    
    assert.ok(lastLog.sql.includes('INNER JOIN "posts" ON "users"."id" = "posts"."user_id"'));
    assert.ok(lastLog.sql.includes('LEFT JOIN "comments" ON "posts"."id" = "comments"."post_id"'));
});

// Type Check Test (Verify compilation only, runtime ignores)
test("Joins - Type Inference", () => {
    // This test passes if it compiles.
    const adapter = new DummyAdapter();
    const db = createDB(schema, adapter);

    const query = db.query('users')
        .innerJoin('posts', 'users.id', '=', 'posts.user_id');
    
    // In a real IDE, hovering over 'query' should show generic type:
    // QueryBuilder<User, User & Post, Schema>
    
    type ResultType = Awaited<ReturnType<typeof query.execute>>[0];
    
    // We can't easily assert types at runtime with Bun test, 
    // but we can trust if this file compiles without ts-error.
    const _check: ResultType = {
        id: 1,
        name: "test",
        user_id: 1,
        title: "test"
    };
    
    assert.ok(true);
});
