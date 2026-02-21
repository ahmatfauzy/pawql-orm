# Transactions

PawQL supports database transactions for atomic operations. If an error occurs, all changes are automatically rolled back.

## Basic Transaction

```typescript
await db.transaction(async (tx) => {
  // All queries inside this callback run within a single transaction
  await tx.query('users')
    .insert({ id: 1, name: 'Alice' })
    .execute();

  await tx.query('users')
    .insert({ id: 2, name: 'Bob' })
    .execute();

  // If both queries succeed → COMMIT
});
```

**Executed SQL:**
```sql
BEGIN
INSERT INTO "users" ("id", "name") VALUES ($1, $2) RETURNING *
INSERT INTO "users" ("id", "name") VALUES ($1, $2) RETURNING *
COMMIT
```

## Auto-Rollback on Error

If an error occurs inside the callback, the transaction is automatically rolled back:

```typescript
try {
  await db.transaction(async (tx) => {
    await tx.query('users')
      .insert({ id: 1, name: 'Alice' })
      .execute();
    
    // Simulate an error!
    throw new Error('Something went wrong!');
    
    // This line will never execute
    await tx.query('users')
      .insert({ id: 2, name: 'Bob' })
      .execute();
  });
} catch (e) {
  console.log('Transaction rolled back:', e.message);
  // Alice was NOT inserted due to rollback
}
```

**Executed SQL:**
```sql
BEGIN
INSERT INTO "users" ("id", "name") VALUES ($1, $2) RETURNING *
ROLLBACK
```

## Transaction with Return Value

Transactions can return a value:

```typescript
const newUser = await db.transaction(async (tx) => {
  const [user] = await tx.query('users')
    .insert({ id: 1, name: 'Alice' })
    .execute();

  await tx.query('posts')
    .insert({ id: 1, userId: 1, title: 'First Post', content: 'Hello!' })
    .execute();

  return user; // Return value from the transaction
});

console.log(newUser.name); // 'Alice'
```

## Use Cases

### Balance Transfer

```typescript
async function transfer(fromId: number, toId: number, amount: number) {
  await db.transaction(async (tx) => {
    // Get sender's balance
    const [sender] = await tx.query('accounts')
      .where({ id: fromId })
      .execute();
    
    if (sender.balance < amount) {
      throw new Error('Insufficient balance');
      // → Automatic ROLLBACK
    }

    // Deduct from sender
    await tx.query('accounts')
      .update({ balance: sender.balance - amount })
      .where({ id: fromId })
      .execute();

    // Add to receiver
    await tx.query('accounts')
      .update({ balance: sender.balance + amount })
      .where({ id: toId })
      .execute();
  });
}
```

### Batch with Consistency

```typescript
async function createUserWithProfile(userData: any, profileData: any) {
  return db.transaction(async (tx) => {
    const [user] = await tx.query('users')
      .insert(userData)
      .execute();

    await tx.query('profiles')
      .insert({ ...profileData, userId: user.id })
      .execute();

    return user;
  });
}
```

## Important Notes

1. **Always use `tx`** (the callback parameter), not `db`. Queries using `db` run outside the transaction.

2. **Don't catch errors inside the callback** unless you want to retry. Let errors propagate so the rollback executes properly.

3. **Nested transactions** are currently flattened (they reuse the same connection). This means nested transactions behave as a single large transaction.

```typescript
// ⚠️ This is a single transaction (flattened)
await db.transaction(async (tx1) => {
  await tx1.query('users').insert({ id: 1 }).execute();
  
  await tx1.transaction(async (tx2) => {
    // tx2 uses the same connection as tx1
    await tx2.query('users').insert({ id: 2 }).execute();
  });
});
```

## Next Steps

- [Querying](./querying.md) — Query data
- [Mutations](./mutations.md) — INSERT, UPDATE, DELETE
- [Testing](./testing.md) — Testing with DummyAdapter
