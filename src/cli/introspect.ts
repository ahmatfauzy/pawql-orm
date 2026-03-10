import { DatabaseAdapter } from "../core/adapter.js";

/**
 * Perform database introspection and generate PawQL schema definition.
 */
export async function introspectDatabase(adapter: DatabaseAdapter): Promise<string> {
  const dialect = adapter.dialect?.toLowerCase() || "postgres";
  
  if (dialect === "postgres") {
    return introspectPostgres(adapter);
  } else if (dialect === "mysql") {
    return introspectMysql(adapter);
  } else if (dialect === "sqlite") {
    return introspectSqlite(adapter);
  } else {
    throw new Error(`Unsupported dialect for introspection: ${dialect}`);
  }
}

function mapPgType(dataType: string): string {
  dataType = dataType.toLowerCase();
  if (dataType.includes("int") || dataType.includes("serial") || dataType.includes("numeric") || dataType.includes("float") || dataType.includes("real")) return "Number";
  if (dataType.includes("bool")) return "Boolean";
  if (dataType.includes("timestamp") || dataType.includes("date")) return "Date";
  if (dataType.includes("json")) return "json()";
  if (dataType.includes("uuid")) return "uuid";
  return "String";
}

function mapMysqlType(dataType: string): string {
  dataType = dataType.toLowerCase();
  if (dataType.includes("int") || dataType.includes("decimal") || dataType.includes("numeric") || dataType.includes("float") || dataType.includes("double")) return "Number";
  if (dataType.includes("tinyint(1)") || dataType.includes("boolean") || dataType.includes("bool")) return "Boolean";
  if (dataType.includes("timestamp") || dataType.includes("date") || dataType.includes("time")) return "Date";
  if (dataType.includes("json")) return "json()";
  return "String";
}

function mapSqliteType(dataType: string): string {
  dataType = dataType.toLowerCase();
  if (dataType.includes("int") || dataType.includes("real") || dataType.includes("num")) return "Number";
  if (dataType.includes("bool")) return "Boolean";
  if (dataType.includes("date") || dataType.includes("time")) return "Date";
  // SQLite JSON uses TEXT technically, but we can't reliably detect JSON columns in SQLite
  // unless explicitly named or typed as JSON.
  if (dataType.includes("json")) return "json()";
  return "String";
}

async function introspectPostgres(adapter: DatabaseAdapter): Promise<string> {
  // Query to get tables and columns in public schema
  const q = `
    SELECT 
      c.table_name, 
      c.column_name, 
      c.data_type, 
      c.is_nullable, 
      c.column_default,
      tc.constraint_type
    FROM information_schema.columns c
    LEFT JOIN information_schema.key_column_usage kcu
      ON c.table_schema = kcu.table_schema 
      AND c.table_name = kcu.table_name 
      AND c.column_name = kcu.column_name
    LEFT JOIN information_schema.table_constraints tc
      ON kcu.constraint_name = tc.constraint_name 
      AND tc.constraint_type = 'PRIMARY KEY'
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position;
  `;
  
  const result = await adapter.query(q);
  
  const tables: Record<string, Record<string, any>> = {};
  for (const row of result.rows) {
    if (!tables[row.table_name]) tables[row.table_name] = {};
    
    const isNullable = row.is_nullable === 'YES';
    const isPrimaryKey = row.constraint_type === 'PRIMARY KEY';
    const typeStr = mapPgType(row.data_type);
    
    tables[row.table_name]![row.column_name] = {
      type: typeStr,
      nullable: isNullable,
      primaryKey: isPrimaryKey
    };
  }

  return generateCode(tables);
}

async function introspectMysql(adapter: DatabaseAdapter): Promise<string> {
  const q = `
    SELECT 
      table_name, 
      column_name, 
      data_type, 
      is_nullable, 
      column_key 
    FROM information_schema.columns 
    WHERE table_schema = DATABASE()
    ORDER BY table_name, ordinal_position;
  `;
  
  const result = await adapter.query(q);
  
  const tables: Record<string, Record<string, any>> = {};
  for (const row of result.rows) {
    if (!tables[row.table_name]) tables[row.table_name] = {};
    
    // MySQL uses lowercase property names usually, but some drivers return uppercase depending on config.
    // Let's lowercase keys to be safe if they are returned in uppercase.
    const getVal = (r: any, key: string) => r[key] !== undefined ? r[key] : r[key.toUpperCase()];
    
    const tableName = getVal(row, 'table_name');
    const colName = getVal(row, 'column_name');
    const dataType = getVal(row, 'data_type');
    const isNullable = getVal(row, 'is_nullable') === 'YES';
    const isPrimaryKey = getVal(row, 'column_key') === 'PRI';
    
    if (!tables[tableName]) tables[tableName] = {};
    
    const typeStr = mapMysqlType(dataType);
    
    tables[tableName]![colName] = {
      type: typeStr,
      nullable: isNullable,
      primaryKey: isPrimaryKey
    };
  }
  
  return generateCode(tables);
}

async function introspectSqlite(adapter: DatabaseAdapter): Promise<string> {
  // get all tables
  const tablesResult = await adapter.query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
  
  const tables: Record<string, Record<string, any>> = {};
  
  for (const tRow of tablesResult.rows) {
    const tableName = tRow.name;
    tables[tableName] = {};
    
    const pragmaRes = await adapter.query(`PRAGMA table_info("${tableName}")`);
    for (const row of pragmaRes.rows) {
      const isNullable = row.notnull === 0;
      const isPrimaryKey = row.pk > 0;
      const typeStr = mapSqliteType(row.type);
      
      tables[tableName]![row.name] = {
        type: typeStr,
        nullable: isNullable,
        primaryKey: isPrimaryKey
      };
    }
  }
  
  return generateCode(tables);
}

function generateCode(tables: Record<string, Record<string, any>>): string {
  const imports = new Set<string>();
  
  let code = "export const schema = {\n";
  
  for (const [tableName, columns] of Object.entries(tables)) {
    code += `  ${tableName}: {\n`;
    for (const [colName, colDef] of Object.entries(columns)) {
      if (colDef.type === "json()") imports.add("json");
      if (colDef.type === "uuid") imports.add("uuid");
      
      // Simplify if possible
      if (!colDef.nullable && !colDef.primaryKey) {
        // Can be just `String` or `Number`
        code += `    ${colName}: ${colDef.type},\n`;
      } else {
        const props = [];
        props.push(`type: ${colDef.type}`);
        if (colDef.primaryKey) props.push(`primaryKey: true`);
        if (colDef.nullable) props.push(`nullable: true`);
        
        code += `    ${colName}: { ${props.join(", ")} },\n`;
      }
    }
    code += `  },\n`;
  }
  
  code += "};\n";
  
  let header = `import type { DatabaseSchema } from "pawql";\n`;
  if (imports.size > 0) {
    header += `import { ${Array.from(imports).join(", ")} } from "pawql";\n`;
  }
  
  return `${header}\n${code}`;
}
