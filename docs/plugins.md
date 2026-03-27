# Plugin System

PawQL is designed to be highly extensible via its **Plugin Architecture**. Community adapters and internal wrappers can hook into the Database object easily by registering plugins at initialization time.

## Creating a Plugin

A plugin must implement the `PawQLPlugin` interface, requiring a `name` and a `setup` callback which receives the initialized `Database` instance.

```typescript
import type { PawQLPlugin, Database } from 'pawql';

export const AuditLoggerPlugin: PawQLPlugin = {
  name: 'audit-logger',
  setup(db: Database<any>) {
    // Hook into all table update events globally
    db.hook('*', 'afterUpdate', (ctx) => {
      console.log(`Table ${ctx.table} updated. New data:`, ctx.data);
    });
  }
};
```

## Registering Plugins

You can pass plugins into the `createDB` options underneath the `plugins` array:

```typescript
import { createDB, PostgresAdapter } from 'pawql';
import { AuditLoggerPlugin } from './plugins/audit';
import { TelemetryPlugin } from './plugins/telemetry';

const db = createDB(schema, new PostgresAdapter(process.env.DATABASE_URL), {
  plugins: [AuditLoggerPlugin, TelemetryPlugin]
});
```

Because `setup(db)` is executed during database instanciation, plugins are fully configured before the first operation can execute.

- [Hooks](./hooks.md) — Detailed event listeners you can use in Plugins
- [Adapters](./adapters.md) — Connecting database drivers

## Built-In Plugins

### Telemetry (`openTelemetryPlugin`)
PawQL exports a built-in plugin that natively connects OpenTelemetry `Tracer` into the hook lifecycle events, ensuring query observations are forwarded securely transparently.

```typescript
import { connect, openTelemetryPlugin } from 'pawql';

// Wrap your company's native tracing logger:
const myTracer = { ... }

const db = await connect(schema, 'mysql://localhost:3306/db', {
  plugins: [openTelemetryPlugin(myTracer)]
})
```
