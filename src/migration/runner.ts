
import { DatabaseAdapter } from "../core/adapter.js";
import { MigrationRunner } from "./types.js";
import { JsonType, UuidType, EnumType, ArrayType, VarcharType, TextType, BigIntType, DecimalType } from "../types/schema.js";
import { buildColumnSQL } from "../core/dialect.js";

/**
 * Converts a PawQL column definition to a SQL column type string.
 * Dialect-aware via adapter.
 */
function columnToSQL(adapter: DatabaseAdapter, colName: string, colSchema: any, tableName: string = "unknown"): string {
  const quoted = adapter.quote(colName);

  let type: any;
  let isNullable = false;
  let isPrimaryKey = false;
  let defaultValue: any = undefined;

  if (typeof colSchema === "function") {
    type = colSchema;
  } else if (colSchema instanceof JsonType) {
    type = colSchema;
  } else if (colSchema instanceof UuidType) {
    type = colSchema;
  } else if (colSchema instanceof EnumType) {
    type = colSchema;
  } else if (colSchema instanceof ArrayType) {
    type = colSchema;
  } else if (colSchema instanceof VarcharType || colSchema instanceof TextType || colSchema instanceof BigIntType || colSchema instanceof DecimalType) {
    type = colSchema;
  } else {
    type = colSchema.type;
    isNullable = !!colSchema.nullable;
    isPrimaryKey = !!colSchema.primaryKey;
    defaultValue = colSchema.default;
  }

  return buildColumnSQL(adapter, colName, tableName, type, isNullable, isPrimaryKey, defaultValue, quoted);
}

/**
 * Creates a MigrationRunner that executes DDL against the given adapter.
 * Reuses PawQL's runtime schema types — no code generation required.
 */
export function createMigrationRunner(adapter: DatabaseAdapter): MigrationRunner {
  return {
    async sql(query: string, params?: any[]): Promise<void> {
      await adapter.query(query, params);
    },

    async createTable(
      tableName: string,
      columns: Record<string, any>
    ): Promise<void> {
      const columnDefs: string[] = [];
      for (const [colName, colSchema] of Object.entries(columns)) {
        columnDefs.push(columnToSQL(adapter, colName, colSchema, tableName));
      }
      const sql = `CREATE TABLE IF NOT EXISTS ${adapter.quote(tableName)} (\n  ${columnDefs.join(
        ",\n  "
      )}\n);`;
      await adapter.query(sql);
    },

    async dropTable(tableName: string): Promise<void> {
      const dialect = (adapter.dialect?.toLowerCase() || "postgres") as string;
      // MySQL and SQLite do not support CASCADE in DROP TABLE
      const cascade = dialect === "postgres" ? " CASCADE" : "";
      await adapter.query(`DROP TABLE IF EXISTS ${adapter.quote(tableName)}${cascade};`);
    },

    async addColumn(
      tableName: string,
      columnName: string,
      definition: any
    ): Promise<void> {
      const colSql = columnToSQL(adapter, columnName, definition, tableName);
      await adapter.query(
        `ALTER TABLE ${adapter.quote(tableName)} ADD COLUMN ${colSql};`
      );
    },

    async dropColumn(
      tableName: string,
      columnName: string
    ): Promise<void> {
      await adapter.query(
        `ALTER TABLE ${adapter.quote(tableName)} DROP COLUMN ${adapter.quote(columnName)};`
      );
    },

    async renameTable(oldName: string, newName: string): Promise<void> {
      await adapter.query(
        `ALTER TABLE ${adapter.quote(oldName)} RENAME TO ${adapter.quote(newName)};`
      );
    },

    async renameColumn(
      tableName: string,
      oldName: string,
      newName: string
    ): Promise<void> {
      await adapter.query(
        `ALTER TABLE ${adapter.quote(tableName)} RENAME COLUMN ${adapter.quote(oldName)} TO ${adapter.quote(newName)};`
      );
    },
  };
}
