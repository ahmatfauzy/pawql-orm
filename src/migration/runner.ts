
import { DatabaseAdapter } from "../core/adapter.js";
import { MigrationRunner } from "./types.js";
import { JsonType, UuidType, EnumType, ArrayType } from "../types/schema.js";

/**
 * Converts a PawQL column definition to a SQL column type string.
 * Works with the same runtime schema objects used in `createDB()`.
 */
function columnToSQL(colName: string, colSchema: any): string {
  const quoted = `"${colName}"`;
  let sql = `${quoted} `;

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
  } else {
    type = colSchema.type;
    isNullable = !!colSchema.nullable;
    isPrimaryKey = !!colSchema.primaryKey;
    defaultValue = colSchema.default;
  }

  // Map types to SQL
  if (type === Number) sql += "INTEGER";
  else if (type === String) sql += "TEXT";
  else if (type === Boolean) sql += "BOOLEAN";
  else if (type === Date) sql += "TIMESTAMP";
  else if (type instanceof JsonType) sql += "JSONB";
  else if (type instanceof UuidType) sql += "UUID";
  else if (type instanceof EnumType) {
    sql += "TEXT";
  } else if (type instanceof ArrayType) {
    const itemType = type.itemType;
    if (itemType === Number) sql += "INTEGER[]";
    else if (itemType === String) sql += "TEXT[]";
    else if (itemType === Boolean) sql += "BOOLEAN[]";
    else if (itemType === Date) sql += "TIMESTAMP[]";
    else throw new Error(`Unsupported array item type for column "${colName}"`);
  } else {
    throw new Error(`Unsupported type for column "${colName}"`);
  }

  // Constraints
  if (isPrimaryKey) sql += " PRIMARY KEY";
  if (!isNullable && !isPrimaryKey) sql += " NOT NULL";

  // Enum CHECK constraint
  if (type instanceof EnumType && type.values.length > 0) {
    const allowed = type.values.map((v: string) => `'${v}'`).join(", ");
    sql += ` CHECK (${quoted} IN (${allowed}))`;
  }

  if (defaultValue !== undefined) {
    if (typeof defaultValue === "string")
      sql += ` DEFAULT '${defaultValue.replace(/'/g, "''")}'`;
    else if (typeof defaultValue === "number")
      sql += ` DEFAULT ${defaultValue}`;
    else if (typeof defaultValue === "boolean")
      sql += ` DEFAULT ${defaultValue ? "TRUE" : "FALSE"}`;
    else if (defaultValue instanceof Date)
      sql += ` DEFAULT '${defaultValue.toISOString()}'`;
  }

  return sql;
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
        columnDefs.push(columnToSQL(colName, colSchema));
      }
      const sql = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${columnDefs.join(
        ",\n  "
      )}\n);`;
      await adapter.query(sql);
    },

    async dropTable(tableName: string): Promise<void> {
      await adapter.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
    },

    async addColumn(
      tableName: string,
      columnName: string,
      definition: any
    ): Promise<void> {
      const colSql = columnToSQL(columnName, definition);
      await adapter.query(
        `ALTER TABLE "${tableName}" ADD COLUMN ${colSql};`
      );
    },

    async dropColumn(
      tableName: string,
      columnName: string
    ): Promise<void> {
      await adapter.query(
        `ALTER TABLE "${tableName}" DROP COLUMN "${columnName}";`
      );
    },

    async renameTable(oldName: string, newName: string): Promise<void> {
      await adapter.query(
        `ALTER TABLE "${oldName}" RENAME TO "${newName}";`
      );
    },

    async renameColumn(
      tableName: string,
      oldName: string,
      newName: string
    ): Promise<void> {
      await adapter.query(
        `ALTER TABLE "${tableName}" RENAME COLUMN "${oldName}" TO "${newName}";`
      );
    },
  };
}
