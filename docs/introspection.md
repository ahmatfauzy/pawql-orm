# Schema Introspection

PawQL provides a runtime function to extract and reverse-engineer a `DatabaseSchema` object from an existing database. This is entirely programmatic and avoids any CLI-based code generation, staying true to our Zero-Codegen philosophy.

## Usage

You can use the `introspectDatabase` function in your own setup scripts or API endpoints.

```typescript
import { connect, introspectDatabase } from 'pawql';

async function introspect() {
  const db = await connect({}, 'postgres://user:pass@localhost:5432/mydb');

  // Extracts the schema from the live PostgreSQL database
  const schemaCode = await introspectDatabase(db.adapter);
  
  // You can print it or write it to a file yourself using fs.writeFileSync
  console.log(schemaCode);
  
  await db.close();
}

introspect();
```

Resulting `schemaCode` output preview:
```typescript
export const schema = {
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    email: String,
    created_at: { type: Date, nullable: true },
  },
  posts: {
    id: { type: Number, primaryKey: true },
    title: String,
    user_id: Number,
  },
};
```
