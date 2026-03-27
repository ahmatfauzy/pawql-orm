# Streaming Data

When working with very large datasets, using `.execute()` or `.raw()` might load millions of rows into Memory, causing `Out of Memory (OOM)` errors.

PawQL provides a built-in `.stream()` method on the query builder that automatically batches results using `LIMIT` and `OFFSET` iteration. 

## Basic Streaming

You can use the native `for await...of` loop to consume rows in chunks:

```typescript
const chunkSize = 100;

for await (const usersChunk of db.query('users').stream(chunkSize)) {
  console.log(`Processing batch of ${usersChunk.length} users...`);
  
  // Automatically fully typed!
  for (const user of usersChunk) {
    await sendWeeklyEmail(user.email);
  }
}
```

By default, `.stream()` processes 100 rows per chunk if you don't specify a `chunkSize`.

## With WHERE and ORDER BY

`.stream()` integrates perfectly with all standard `.where()`, `.with()`, and `.orderBy()` clauses:

```typescript
for await (const chunk of db.query('users')
  .where({ isActive: true })
  .orderBy('createdAt', 'ASC')
  .with('posts')
  .stream(50) 
) {
  // Process 50 active users with their posts at a time...
}
```

## Integration with Limits

If you apply a `.limit()` to the query builder, `.stream()` respects that upper boundary:

```typescript
// Even though chunkSize is 100, the stream will yield exactly 2 chunks:
// Chunk 1: 100 rows
// Chunk 2: 50 rows
// Then it stops, matching the 150 limit.
for await (const chunk of db.query('users').limit(150).stream(100)) {
  console.log('Got chunk');
}
```

## Next Steps

- [Querying](./querying.md) — Standard retrieval methods
- [Plugins](./plugins.md) — Extend PawQL capabilities
