# Parameter Validation

PawQL includes a built-in parameter validation system that checks your input data against your schema definition at runtime. This catches type mismatches, missing columns, and invalid values **before** they hit the database — giving you clear, actionable error messages.

## Why Runtime Validation?

TypeScript's type system only catches errors at compile time. But many real-world scenarios involve dynamic data (API payloads, form submissions, user input) where types can't be statically verified. PawQL's validator bridges this gap.

```typescript
// TypeScript can't catch this at compile time if `data` comes from an API:
const data = await request.json();  // any

// PawQL catches it at runtime:
assertValid(data, schema.users, 'users');
// ✓ Throws immediately if data is wrong
```

## Basic Usage

### `validateRow()` — Check without throwing

```typescript
import { validateRow } from 'pawql';

const schema = {
  id: { type: Number, primaryKey: true },
  name: String,
  email: { type: String, nullable: true },
  age: Number,
};

// Valid data
const good = validateRow({ id: 1, name: 'Alice', age: 25 }, schema);
console.log(good.valid);   // true
console.log(good.errors);  // []

// Invalid data
const bad = validateRow({ id: 'wrong', name: 123, age: 'bad' }, schema);
console.log(bad.valid);    // false
console.log(bad.errors);
// [
//   { column: 'id', message: 'Expected a number, got string', value: 'wrong', expectedType: 'number' },
//   { column: 'name', message: 'Expected a string, got number', value: 123, expectedType: 'string' },
//   { column: 'age', message: 'Expected a number, got string', value: 'bad', expectedType: 'number' },
// ]
```

### `assertValid()` — Check and throw

```typescript
import { assertValid, PawQLValidationError } from 'pawql';

try {
  assertValid(
    { id: 'wrong', name: 123 },
    schema.users,
    'users'
  );
} catch (e) {
  if (e instanceof PawQLValidationError) {
    console.log(e.table);     // 'users'
    console.log(e.details);   // [{ row: 0, errors: [...] }]
    console.log(e.message);
    // Validation failed for table "users":
    //   id: Expected a number, got string
    //   name: Expected a string, got number
  }
}
```

### Validate Multiple Rows

`assertValid()` accepts an array of rows and reports which row(s) failed:

```typescript
assertValid(
  [
    { id: 1, name: 'Alice', age: 25 },       // ✓ Valid
    { id: 'bad', name: 123, age: 'wrong' },   // ✗ Invalid
  ],
  schema.users,
  'users'
);
// Error: Validation failed for table "users":
//   Row 1: id: Expected a number, got string
//   Row 1: name: Expected a string, got number
//   Row 1: age: Expected a number, got string
```

## Supported Types

The validator checks all PawQL schema types:

| Schema Type | Validation Rule |
|-------------|-----------------|
| `Number` | Must be `typeof 'number'` and not `NaN` |
| `String` | Must be `typeof 'string'` |
| `Boolean` | Must be `typeof 'boolean'` |
| `Date` | Must be a `Date` instance or valid date string |
| `uuid` | Must be a string matching UUID v4 format |
| `enumType(...)` | Must be a string matching one of the allowed values |
| `arrayType(T)` | Must be an array; each element is validated against `T` |
| `json<T>()` | Must be a non-null object |

## Validation Options

```typescript
const options: ValidateOptions = {
  partial: false,       // Allow missing columns (useful for UPDATE)
  skipDefaults: true,   // Skip columns with default values
  skipPrimaryKey: false, // Skip primary key columns
};

const result = validateRow(data, schema, options);
```

### `partial` — For Updates

When updating a row, you usually don't supply all columns. Use `partial: true` to allow missing columns:

```typescript
// Only updating name — other columns are missing but that's OK
const result = validateRow(
  { name: 'New Name' },
  schema.users,
  { partial: true }
);
console.log(result.valid); // true
```

**Note:** Even in partial mode, *provided* values are still type-checked.

### `skipDefaults`

Columns with `default` values in the schema are considered optional. This is enabled by default:

```typescript
const schema = {
  isActive: { type: Boolean, default: true },
};

// Missing `isActive` is OK because it has a default
validateRow({}, schema, { skipDefaults: true }); // valid
```

### `skipPrimaryKey`

Skip validation of primary key columns (useful when PKs are auto-generated):

```typescript
validateRow(
  { name: 'Alice', age: 25 },
  schema.users,
  { skipPrimaryKey: true }
); // valid — id is not required
```

## Error Structure

### `ValidationError`

Each individual error has the following shape:

```typescript
interface ValidationError {
  column: string;       // Column name (e.g., 'age', 'tags[0]')
  message: string;      // Human-readable message
  value: unknown;       // The actual value provided
  expectedType: string; // Expected type (e.g., 'number', 'enum(admin | user)')
}
```

### `PawQLValidationError`

Thrown by `assertValid()`, extends `Error`:

```typescript
class PawQLValidationError extends Error {
  table: string;
  details: { row: number; errors: ValidationError[] }[];
}
```

## Integration with Seeders

The [seeder](./seeders.md) uses validation by default. Every row is checked against the schema before inserting:

```typescript
import { seed } from 'pawql';

await seed(db, {
  users: [
    { id: 'wrong', name: 123 }, // Will throw PawQLValidationError
  ],
});
```

## Advanced Type Validation Examples

### UUID

```typescript
// ✓ Valid UUID
validateRow({ id: '550e8400-e29b-41d4-a716-446655440000' }, { id: uuid });

// ✗ Invalid UUID format
validateRow({ id: 'not-a-uuid' }, { id: uuid });
// Error: Invalid UUID format: "not-a-uuid"
```

### Enum

```typescript
const roleSchema = { role: enumType('admin', 'user', 'guest') };

// ✓ Valid enum value
validateRow({ role: 'admin' }, roleSchema);

// ✗ Invalid enum value
validateRow({ role: 'superadmin' }, roleSchema);
// Error: Value "superadmin" is not a valid enum value. Allowed: admin, user, guest
```

### Array

```typescript
const tagsSchema = { tags: arrayType(String) };

// ✓ Valid array
validateRow({ tags: ['js', 'ts'] }, tagsSchema);

// ✗ Not an array
validateRow({ tags: 'js' }, tagsSchema);
// Error: Expected an array, got string

// ✗ Wrong element type
validateRow({ tags: [1, 2, 3] }, tagsSchema);
// Error: tags[0]: Expected a string, got number
```

### Unknown Columns

```typescript
validateRow({ id: 1, unknownCol: 'oops' }, schema);
// Error: Unknown column "unknownCol" — not defined in schema
```

## API Summary

| Function | Description |
|----------|-------------|
| `validateRow(data, schema, options?)` | Validate a single row, returns `ValidationResult` |
| `assertValid(data, schema, table, options?)` | Validate and throw `PawQLValidationError` on failure |

| Type | Description |
|------|-------------|
| `ValidationError` | Single column error with message, value, expectedType |
| `ValidationResult` | `{ valid: boolean, errors: ValidationError[] }` |
| `ValidateOptions` | `{ partial?, skipDefaults?, skipPrimaryKey? }` |
| `PawQLValidationError` | Error class with `table` and `details` properties |

See the [API Reference](./api-reference.md) for full type signatures.
