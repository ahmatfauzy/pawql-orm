
import { test, expect, describe } from "bun:test";
import { createDB, string, number, boolean, date } from "../src/index";
import { DummyAdapter } from "../src/adapters/dummy";

// Define schema
const schema = {
  users: {
    id: number,
    name: string,
    email: string,
    isActive: boolean
  },
  posts: {
    id: number,
    userId: number,
    title: string,
    content: string,
    created_at: date
  }
};

describe("Query Builder Tests", () => {
    test("createDB initializes correctly", () => {
        const adapter = new DummyAdapter() as any;
        const db = createDB(schema, adapter);
        expect(db).toBeDefined();
    });

    test("query builder generates correct SQL for select + where", () => {
        const adapter = new DummyAdapter() as any;
        const db = createDB(schema, adapter);

        const query = db.query("users")
            .select("id", "name")
            .where("isActive", "=", true)
            .limit(10)
            .offset(0);
        
        const { sql, values } = query.toSQL();

        expect(sql).toBe("SELECT id, name FROM users WHERE isActive = $1 LIMIT 10 OFFSET 0");
        expect(values).toEqual([true]);
    });
});
