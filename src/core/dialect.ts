import {
  JsonType,
  UuidType,
  EnumType,
  ArrayType,
  VarcharType,
  TextType,
  BigIntType,
  DecimalType,
} from "../types/schema.js";
import type { DatabaseAdapter } from "./adapter.js";

/**
 * Map a PawQL column type to a dialect-specific SQL type string.
 * Handles Postgres vs MySQL vs SQLite differences.
 */
export function mapColumnTypeToSQL(
  adapter: DatabaseAdapter,
  type: any,
  tableName: string,
  colName: string
): string {
  const dialect = (adapter.dialect?.toLowerCase() || "postgres") as string;
  const isMysql = dialect === "mysql";
  const isSqlite = dialect === "sqlite";

  if (type === Number) return "INTEGER";
  if (type === String) return "TEXT";
  if (type === Boolean) {
    if (isSqlite) return "INTEGER";
    return "BOOLEAN";
  }
  if (type === Date) return "TIMESTAMP";
  if (type instanceof JsonType) {
    if (isMysql) return "JSON";
    if (isSqlite) return "TEXT";
    return "JSONB";
  }
  if (type instanceof UuidType) {
    if (isMysql) return "VARCHAR(36)";
    if (isSqlite) return "TEXT";
    return "UUID";
  }
  if (type instanceof EnumType) {
    return "TEXT";
  }
  if (type instanceof VarcharType) return `VARCHAR(${type.length})`;
  if (type instanceof TextType) return "TEXT";
  if (type instanceof BigIntType) return "BIGINT";
  if (type instanceof DecimalType) return `DECIMAL(${type.precision}, ${type.scale})`;
  if (type instanceof ArrayType) {
    if (isMysql || isSqlite) {
      throw new Error(
        `ArrayType is only supported on PostgreSQL. Column "${tableName}.${colName}" uses arrayType() but adapter is "${dialect}". Use json() for MySQL/SQLite instead.`
      );
    }
    const itemType = type.itemType;
    if (itemType === Number) return "INTEGER[]";
    if (itemType === String) return "TEXT[]";
    if (itemType === Boolean) return "BOOLEAN[]";
    if (itemType === Date) return "TIMESTAMP[]";
    throw new Error(`Unsupported array item type for column ${tableName}.${colName}`);
  }

  throw new Error(`Unsupported type for column ${tableName}.${colName}`);
}

/**
 * Build a full column definition SQL fragment (quoted name + type + constraints).
 */
export function buildColumnSQL(
  adapter: DatabaseAdapter,
  colName: string,
  tableName: string,
  type: any,
  isNullable: boolean,
  isPrimaryKey: boolean,
  defaultValue: any,
  quotedCol?: string
): string {
  const quoted = quotedCol ?? adapter.quote(colName);
  const dialect = (adapter.dialect?.toLowerCase() || "postgres") as string;
  let sql = `${quoted} ${mapColumnTypeToSQL(adapter, type, tableName, colName)}`;

  if (isPrimaryKey) sql += " PRIMARY KEY";
  if (!isNullable && !isPrimaryKey) sql += " NOT NULL";

  // Enum CHECK constraint — supported on Postgres/SQLite, MySQL 8.0.16+ supports CHECK
  if (type instanceof EnumType && type.values.length > 0) {
    const allowed = type.values.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(", ");
    sql += ` CHECK (${quoted} IN (${allowed}))`;
  }

  if (defaultValue !== undefined) {
    if (typeof defaultValue === "string") sql += ` DEFAULT '${defaultValue.replace(/'/g, "''")}'`;
    else if (typeof defaultValue === "number") sql += ` DEFAULT ${defaultValue}`;
    else if (typeof defaultValue === "boolean") {
      // SQLite prefers 1/0 but TRUE/FALSE also works; keep TRUE/FALSE for cross-dialect
      if (dialect === "sqlite") sql += ` DEFAULT ${defaultValue ? 1 : 0}`;
      else sql += ` DEFAULT ${defaultValue ? "TRUE" : "FALSE"}`;
    } else if (defaultValue instanceof Date) sql += ` DEFAULT '${defaultValue.toISOString()}'`;
  }

  return sql;
}
