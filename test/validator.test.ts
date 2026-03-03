
import { test } from "node:test";
import assert from "node:assert";
import { validateRow, assertValid, PawQLValidationError } from "../src/core/validator.js";
import { json, uuid, enumType, arrayType } from "../src/types/schema.js";
import type { TableSchema, ValidateOptions } from "../src/index.js";

// ============================================
// Test Schemas
// ============================================

const userSchema: TableSchema = {
  id: { type: Number, primaryKey: true },
  name: String,
  email: { type: String, nullable: true },
  age: Number,
  isActive: { type: Boolean, default: true },
};

const advancedSchema: TableSchema = {
  id: uuid,
  role: enumType("admin", "user", "guest"),
  tags: arrayType(String),
  metadata: json<{ key: string }>(),
  createdAt: Date,
};

// ============================================
// validateRow — Basic Type Checks
// ============================================

test("validateRow — valid data passes", () => {
  const result = validateRow(
    { id: 1, name: "Alice", age: 25 },
    userSchema
  );
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test("validateRow — wrong number type", () => {
  const result = validateRow(
    { id: "not-a-number", name: "Alice", age: 25 },
    userSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "id" && e.expectedType === "number"));
});

test("validateRow — wrong string type", () => {
  const result = validateRow(
    { id: 1, name: 123, age: 25 },
    userSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "name" && e.expectedType === "string"));
});

test("validateRow — wrong boolean type", () => {
  const result = validateRow(
    { id: 1, name: "Alice", age: 25, isActive: "yes" },
    userSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "isActive" && e.expectedType === "boolean"));
});

test("validateRow — NaN is invalid for number", () => {
  const result = validateRow(
    { id: 1, name: "Alice", age: NaN },
    userSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "age"));
});

// ============================================
// validateRow — Nullable / Missing Columns
// ============================================

test("validateRow — nullable column accepts null", () => {
  const result = validateRow(
    { id: 1, name: "Alice", email: null, age: 25 },
    userSchema
  );
  assert.strictEqual(result.valid, true);
});

test("validateRow — non-nullable null causes error", () => {
  const result = validateRow(
    { id: 1, name: null, age: 25 },
    userSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "name" && e.message.includes("not nullable")));
});

test("validateRow — missing required column", () => {
  const result = validateRow(
    { id: 1, age: 25 },
    userSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "name" && e.message.includes("Missing")));
});

test("validateRow — missing nullable column is OK", () => {
  const result = validateRow(
    { id: 1, name: "Alice", age: 25 },
    userSchema
  );
  // email is nullable, so missing is OK
  assert.strictEqual(result.valid, true);
});

test("validateRow — missing column with default is OK", () => {
  const result = validateRow(
    { id: 1, name: "Alice", age: 25 },
    userSchema,
    { skipDefaults: true }
  );
  // isActive has a default, so missing is OK
  assert.strictEqual(result.valid, true);
});

test("validateRow — missing primaryKey column is OK by default", () => {
  const result = validateRow(
    { name: "Alice", age: 25 },
    userSchema
  );
  // id is a primaryKey so it's skipped
  assert.strictEqual(result.valid, true);
});

// ============================================
// validateRow — Partial Mode
// ============================================

test("validateRow — partial mode allows missing columns", () => {
  const result = validateRow(
    { name: "Alice" },
    userSchema,
    { partial: true }
  );
  assert.strictEqual(result.valid, true);
});

test("validateRow — partial mode still validates types", () => {
  const result = validateRow(
    { name: 123 },
    userSchema,
    { partial: true }
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "name"));
});

// ============================================
// validateRow — Unknown Columns
// ============================================

test("validateRow — unknown column detected", () => {
  const result = validateRow(
    { id: 1, name: "Alice", age: 25, unknown_col: "boom" },
    userSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "unknown_col" && e.message.includes("Unknown")));
});

// ============================================
// validateRow — Advanced Types
// ============================================

test("validateRow — valid UUID", () => {
  const result = validateRow(
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      role: "admin",
      tags: ["js", "ts"],
      metadata: { key: "value" },
      createdAt: new Date(),
    },
    advancedSchema
  );
  assert.strictEqual(result.valid, true);
});

test("validateRow — invalid UUID format", () => {
  const result = validateRow(
    {
      id: "not-a-uuid",
      role: "admin",
      tags: [],
      metadata: {},
      createdAt: new Date(),
    },
    advancedSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "id" && e.message.includes("UUID")));
});

test("validateRow — invalid enum value", () => {
  const result = validateRow(
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      role: "superadmin",
      tags: [],
      metadata: {},
      createdAt: new Date(),
    },
    advancedSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "role" && e.message.includes("not a valid enum")));
});

test("validateRow — invalid array type", () => {
  const result = validateRow(
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      role: "admin",
      tags: "not-an-array",
      metadata: {},
      createdAt: new Date(),
    },
    advancedSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "tags" && e.message.includes("array")));
});

test("validateRow — array with wrong element types", () => {
  const result = validateRow(
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      role: "admin",
      tags: [1, 2, 3],
      metadata: {},
      createdAt: new Date(),
    },
    advancedSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column.startsWith("tags[") && e.expectedType === "string"));
});

test("validateRow — JSON must be an object", () => {
  const result = validateRow(
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      role: "admin",
      tags: [],
      metadata: "not-json",
      createdAt: new Date(),
    },
    advancedSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "metadata" && e.expectedType.includes("JSON")));
});

test("validateRow — Date accepts Date object", () => {
  const result = validateRow(
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      role: "admin",
      tags: [],
      metadata: {},
      createdAt: new Date("2024-01-01"),
    },
    advancedSchema
  );
  assert.strictEqual(result.valid, true);
});

test("validateRow — Date accepts valid date string", () => {
  const result = validateRow(
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      role: "admin",
      tags: [],
      metadata: {},
      createdAt: "2024-01-01T00:00:00Z",
    },
    advancedSchema
  );
  assert.strictEqual(result.valid, true);
});

test("validateRow — Date rejects invalid date string", () => {
  const result = validateRow(
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      role: "admin",
      tags: [],
      metadata: {},
      createdAt: "not-a-date",
    },
    advancedSchema
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.column === "createdAt" && e.message.includes("Invalid date")));
});

// ============================================
// assertValid — Throws on Error
// ============================================

test("assertValid — does not throw for valid data", () => {
  assert.doesNotThrow(() => {
    assertValid(
      { id: 1, name: "Alice", age: 25 },
      userSchema,
      "users"
    );
  });
});

test("assertValid — throws PawQLValidationError for invalid data", () => {
  assert.throws(
    () => {
      assertValid(
        { id: "bad", name: 123, age: "string" },
        userSchema,
        "users"
      );
    },
    (err: any) => {
      assert.ok(err instanceof PawQLValidationError);
      assert.strictEqual(err.table, "users");
      assert.ok(err.details.length > 0);
      assert.ok(err.message.includes("Validation failed"));
      return true;
    }
  );
});

test("assertValid — validates array of rows", () => {
  assert.throws(
    () => {
      assertValid(
        [
          { id: 1, name: "Alice", age: 25 },
          { id: "bad", name: 123, age: "wrong" },
        ],
        userSchema,
        "users"
      );
    },
    (err: any) => {
      assert.ok(err instanceof PawQLValidationError);
      // Row 0 valid, Row 1 invalid — details should have row 1
      assert.ok(err.details.some((d: any) => d.row === 1));
      return true;
    }
  );
});

test("assertValid — PawQLValidationError has structured details", () => {
  try {
    assertValid(
      { id: "bad", name: 123 },
      userSchema,
      "users"
    );
    assert.fail("Should have thrown");
  } catch (e) {
    assert.ok(e instanceof PawQLValidationError);
    assert.strictEqual(e.name, "PawQLValidationError");
    assert.strictEqual(e.table, "users");
    assert.ok(Array.isArray(e.details));
    assert.ok(e.details[0]!.errors.length > 0);
    // Check error structure
    const err = e.details[0]!.errors[0]!;
    assert.ok("column" in err);
    assert.ok("message" in err);
    assert.ok("value" in err);
    assert.ok("expectedType" in err);
  }
});

// ============================================
// validateRow — skipPrimaryKey option
// ============================================

test("validateRow — skipPrimaryKey skips PK validation", () => {
  const result = validateRow(
    { name: "Alice", age: 25 },
    userSchema,
    { skipPrimaryKey: true }
  );
  assert.strictEqual(result.valid, true);
});
