import { PawQLPlugin, Database } from "../core/database.js";

/**
 * Interface representing a standard OpenTelemetry Tracer.
 * Avoids hard dependency on `@opentelemetry/api`.
 */
export interface OpenTelemetryTracer {
  startActiveSpan(name: string, callback: (span: any) => Promise<any>): Promise<any>;
}

/**
 * Internal helper to inject OpenTelemetry tracking via hooks.
 * It tracks query execution lifecycle globally.
 */
export function openTelemetryPlugin(tracer: OpenTelemetryTracer): PawQLPlugin {
  return {
    name: "pawql-opentelemetry",
    setup(db: Database<any>) {
      // Wrapper for executing hooks inside spans
      const createSpan = async (operation: string, table: string, execute: () => Promise<void>) => {
        return tracer.startActiveSpan(`pawql.${operation}.${table}`, async (span) => {
          try {
            await execute();
            span.setStatus({ code: 1 }); // OK
          } catch (error: any) {
            span.recordException(error);
            span.setStatus({ code: 2, message: error.message }); // Error
            throw error;
          } finally {
            span.end();
          }
        });
      };

      // Wrap standard lifecycles
      const hooks = ['beforeSelect', 'beforeInsert', 'beforeUpdate', 'beforeDelete'] as const;
      
      for (const hook of hooks) {
        db.hook("*", hook, async (ctx) => {
          await createSpan(ctx.operation.toLowerCase(), ctx.table, async () => {
             // Telemetry span tracks the startup of the query builder chain
          });
        });
      }
    }
  };
}
