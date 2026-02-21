import { DatabaseAdapter } from "../core/adapter.js";
import { DatabaseSchema, InferTableType } from "../types/schema.js"; // Import InferTableType

type WhereOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "LIKE"
  | "ILIKE"
  | "IN"
  | "NOT IN"
  | "IS"
  | "IS NOT"
  | "BETWEEN";

type WhereValue = any;

interface WhereClause<T> {
  type: "AND" | "OR";
  column: keyof T | string; // Allow string for qualified names (table.col)
  operator: WhereOperator;
  value: WhereValue;
}

interface JoinClause {
  type: "INNER" | "LEFT" | "RIGHT" | "FULL";
  table: string;
  on: { col1: string; op: string; col2: string };
}

interface OrderByClause {
  column: string;
  direction: "ASC" | "DESC";
}

type WhereCondition<T> = {
  [K in keyof T]?:
    | T[K] // Equality
    | { in: T[K][] }
    | { like: string }
    | { ilike: string }
    | { gt: T[K] }
    | { lt: T[K] }
    | { gte: T[K] }
    | { lte: T[K] }
    | { not: T[K] }
    | { between: [T[K], T[K]] }
    | null; // IS NULL
};

// Generic Where for Joined tables (keys are strings like 'users.id')
type JoinedWhereCondition = Record<string, any>;

// Operation types
type Operation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export class QueryBuilder<
  TTable extends Record<string, any>,
  TResult = TTable,
  TSchema extends DatabaseSchema = any 
> {
  private _table: string;
  private _adapter: DatabaseAdapter;
  private _operation: Operation = "SELECT";
  private _data: Partial<TTable> | Partial<TTable>[] | null = null; // For insert/update
  private _select: string[] = []; // Changed to string[] to support "table.col"
  private _where: WhereClause<any>[] = []; // Relaxed type for joins
  private _joins: JoinClause[] = [];
  private _orderByClauses: OrderByClause[] = [];
  private _limit?: number;
  private _offset?: number;
  private _returning: boolean | string[] = false;

  constructor(table: string, adapter: DatabaseAdapter) {
    this._table = table;
    this._adapter = adapter;
  }

  // --- CRUD Operations ---

  insert(data: Partial<TTable> | Partial<TTable>[]): this {
    this._operation = "INSERT";
    this._data = data;
    this._returning = true; // Default: RETURNING *
    return this;
  }

  update(data: Partial<TTable>): this {
    this._operation = "UPDATE";
    this._data = data;
    this._returning = true; // Default: RETURNING *
    return this;
  }

  delete(): this {
    this._operation = "DELETE";
    this._returning = true; // Default: RETURNING *
    return this;
  }

  // --- Joins ---

  /**
   * Inner Join with another table.
   */
  innerJoin<K extends keyof TSchema & string>(
    table: K,
    col1: string,
    operator: string,
    col2: string
  ): QueryBuilder<TTable, TResult & InferTableType<TSchema[K]>, TSchema> {
    this._joins.push({
      type: "INNER",
      table: table,
      on: { col1, op: operator, col2 },
    });
    return this as any;
  }

  /**
   * Left Join with another table.
   * Resulting columns from the joined table might be null (handled by Partial/Nullable in implementation conceptually, 
   * but for type inference we usually intersection. In strict usage, joined props should be partial).
   */
  leftJoin<K extends keyof TSchema & string>(
    table: K,
    col1: string,
    operator: string,
    col2: string
  ): QueryBuilder<TTable, TResult & Partial<InferTableType<TSchema[K]>>, TSchema> {
    this._joins.push({
      type: "LEFT",
      table: table,
      on: { col1, op: operator, col2 },
    });
    return this as any;
  }

  rightJoin<K extends keyof TSchema & string>(
    table: K,
    col1: string,
    operator: string,
    col2: string
  ): QueryBuilder<TTable, TResult & Partial<InferTableType<TSchema[K]>>, TSchema> {
    this._joins.push({
      type: "RIGHT",
      table: table,
      on: { col1, op: operator, col2 },
    });
    return this as any;
  }

  fullJoin<K extends keyof TSchema & string>(
    table: K,
    col1: string,
    operator: string,
    col2: string
  ): QueryBuilder<TTable, TResult & Partial<InferTableType<TSchema[K]>>, TSchema> {
    this._joins.push({
      type: "FULL",
      table: table,
      on: { col1, op: operator, col2 },
    });
    return this as any;
  }

  // --- Clauses ---

  select(
    ...columns: string[]
  ): QueryBuilder<TTable, TResult, TSchema> { // TODO: Infer pick type if possible, but complex with joins
    this._select = columns;
    return this;
  }

  /**
   * Add a WHERE condition (AND).
   * Supports detailed operators via object syntax.
   */
  where(conditions: WhereCondition<TTable> | JoinedWhereCondition): this {
    this._addWhere("AND", conditions);
    return this;
  }

  /**
   * Add a WHERE condition (OR).
   */
  orWhere(conditions: WhereCondition<TTable> | JoinedWhereCondition): this {
    this._addWhere("OR", conditions);
    return this;
  }

  private _addWhere(type: "AND" | "OR", conditions: Record<string, any>) {
    for (const [key, val] of Object.entries(conditions)) {
      const column = key;

      if (val === null) {
        this._where.push({ type, column, operator: "IS", value: null });
      } else if (typeof val === "object" && val !== null && !(val instanceof Date)) {
        // Handle operators
        const ops = val as any;
        if ("in" in ops)
          this._where.push({ type, column, operator: "IN", value: ops.in });
        if ("notIn" in ops)
           this._where.push({ type, column, operator: "NOT IN", value: ops.notIn });
        if ("like" in ops)
          this._where.push({ type, column, operator: "LIKE", value: ops.like });
        if ("ilike" in ops)
           this._where.push({ type, column, operator: "ILIKE", value: ops.ilike });
        if ("gt" in ops)
          this._where.push({ type, column, operator: ">", value: ops.gt });
        if ("lt" in ops)
          this._where.push({ type, column, operator: "<", value: ops.lt });
        if ("gte" in ops)
          this._where.push({ type, column, operator: ">=", value: ops.gte });
        if ("lte" in ops)
          this._where.push({ type, column, operator: "<=", value: ops.lte });
        if ("not" in ops)
           this._where.push({ type, column, operator: "!=", value: ops.not });
        if ("between" in ops)
          this._where.push({ type, column, operator: "BETWEEN", value: ops.between });
      } else {
        // Exact match
        this._where.push({ type, column, operator: "=", value: val });
      }
    }
  }

  /**
   * Add ORDER BY clause.
   * @param column Column name to order by
   * @param direction 'ASC' or 'DESC' (default: 'ASC')
   */
  orderBy(column: string & keyof TTable | string, direction: "ASC" | "DESC" = "ASC"): this {
    this._orderByClauses.push({ column, direction });
    return this;
  }

  limit(limit: number): this {
    this._limit = limit;
    return this;
  }

  offset(offset: number): this {
    this._offset = offset;
    return this;
  }

  /**
   * Control the RETURNING clause for INSERT/UPDATE/DELETE.
   * - `.returning('id', 'name')` → RETURNING "id", "name"
   * - `.returning(false)` → No RETURNING clause
   * - `.returning(true)` or no call → RETURNING * (default for mutations)
   */
  returning(value: false): this;
  returning(...columns: string[]): this;
  returning(...args: [false] | string[]): this {
    if (args[0] === false) {
      this._returning = false;
    } else {
      this._returning = args as string[];
    }
    return this;
  }

  // --- Execution ---

  async execute(): Promise<TResult[]> {
    const { sql, values } = this.toSQL();
    const result = await this._adapter.query<TResult>(sql, values);
    return result.rows;
  }

  /**
   * Execute and return only the first row, or null if no rows.
   * Automatically adds LIMIT 1.
   */
  async first(): Promise<TResult | null> {
    this._limit = 1;
    const { sql, values } = this.toSQL();
    const result = await this._adapter.query<TResult>(sql, values);
    return result.rows[0] ?? null;
  }

  /**
   * Execute a COUNT(*) query and return the count as a number.
   */
  async count(): Promise<number> {
    const savedSelect = this._select;
    const savedOperation = this._operation;
    
    this._select = [];
    this._operation = "SELECT";
    
    // Build SQL manually with COUNT(*)
    const tableUser = this._quote(this._table);
    const values: any[] = [];
    
    let sql = `SELECT COUNT(*) FROM ${tableUser}`;
    sql += this._buildJoins();
    sql += this._buildWhere(values);

    this._select = savedSelect;
    this._operation = savedOperation;

    const result = await this._adapter.query<{ count: string | number }>(sql, values);
    const row = result.rows[0];
    return row ? Number(row.count) : 0;
  }

  then<TResult1 = TResult[], TResult2 = never>(
    onfulfilled?:
      | ((value: TResult[]) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  // Helper to quote identifiers (table/column names)
  private _quote(identifier: string): string {
    if (identifier === "*") return identifier;
    // Don't quote if already quoted or complex expression (simple heuristic)
    if (identifier.includes("(") || identifier.includes(" ") || identifier.startsWith('"')) {
        return identifier;
    }
    // Handle "table.column"
    if (identifier.includes(".")) {
        return identifier.split(".").map(part => `"${part}"`).join(".");
    }
    return `"${identifier}"`;
  }

  // Helper to build WHERE clause (extracted for reuse in count)
  private _buildWhere(values: any[]): string {
    if (this._where.length === 0) return "";
    
    const clauses = this._where.map((clause, index) => {
      let condition = "";
      const col = this._quote(String(clause.column));

      if (clause.operator === "IN" || clause.operator === "NOT IN") {
           if (Array.isArray(clause.value) && clause.value.length > 0) {
               const placeholders = clause.value.map((v: any) => {
                   values.push(v);
                   return `$${values.length}`;
               });
               condition = `${col} ${clause.operator} (${placeholders.join(", ")})`;
           } else {
               condition = clause.operator === "IN" ? "1=0" : "1=1";
           }
      } else if (clause.operator === "IS" || clause.operator === "IS NOT") {
          const val = clause.value === null ? "NULL" : String(clause.value);
          condition = `${col} ${clause.operator} ${val}`;
      } else if (clause.operator === "BETWEEN") {
          if (Array.isArray(clause.value) && clause.value.length === 2) {
            values.push(clause.value[0]);
            const p1 = `$${values.length}`;
            values.push(clause.value[1]);
            const p2 = `$${values.length}`;
            condition = `${col} BETWEEN ${p1} AND ${p2}`;
          } else {
            throw new Error("BETWEEN requires an array of exactly 2 values");
          }
      } else {
         values.push(clause.value);
         condition = `${col} ${clause.operator} $${values.length}`;
      }

      if (index === 0) return condition;
      return `${clause.type} ${condition}`;
    });

    return ` WHERE ${clauses.join(" ")}`;
  }

  // Helper to build JOIN clause (extracted for reuse in count)
  private _buildJoins(): string {
    if (this._joins.length === 0) return "";
    return " " + this._joins.map(j => {
      return `${j.type} JOIN ${this._quote(j.table)} ON ${this._quote(j.on.col1)} ${j.on.op} ${this._quote(j.on.col2)}`;
    }).join(" ");
  }

  // Helper to build ORDER BY clause
  private _buildOrderBy(): string {
    if (this._orderByClauses.length === 0) return "";
    const clauses = this._orderByClauses.map(o => `${this._quote(o.column)} ${o.direction}`);
    return ` ORDER BY ${clauses.join(", ")}`;
  }

  // Helper to build RETURNING clause
  private _buildReturning(): string {
    if (this._returning === false) return "";
    if (this._returning === true) return " RETURNING *";
    if (Array.isArray(this._returning) && this._returning.length > 0) {
      return ` RETURNING ${this._returning.map(c => this._quote(c)).join(", ")}`;
    }
    return " RETURNING *";
  }

  toSQL(): { sql: string; values: any[] } {
    const columns = this._select.length > 0
        ? this._select.map(c => this._quote(c)).join(", ")
        : "*";
    const tableUser = this._quote(this._table);
    const values: any[] = [];
    let sql = "";

    switch (this._operation) {
      case "SELECT":
        sql = `SELECT ${columns} FROM ${tableUser}`;
        sql += this._buildJoins();
        sql += this._buildWhere(values);
        sql += this._buildOrderBy();
        if (this._limit !== undefined) sql += ` LIMIT ${this._limit}`;
        if (this._offset !== undefined) sql += ` OFFSET ${this._offset}`;
        break;

      case "INSERT":
        if (this._joins.length > 0) throw new Error("INSERT does not support JOINS");
        if (!this._data) throw new Error("No data provided for INSERT");
        
        const dataIn = Array.isArray(this._data) ? this._data : [this._data];
        if (dataIn.length === 0)
          throw new Error("Empty data array for INSERT");

        const firstRow = dataIn[0] as any;
        const keys = Object.keys(firstRow);
        if (keys.length === 0) throw new Error("No columns to insert");

        const quotedKeys = keys.map(k => this._quote(k));

        const placeHolders: string[] = [];
        dataIn.forEach((row) => {
          const rowPlaceholders: string[] = [];
          keys.forEach((key) => {
            values.push((row as any)[key]); // Keep original key for access
            rowPlaceholders.push(`$${values.length}`);
          });
          placeHolders.push(`(${rowPlaceholders.join(", ")})`);
        });

        sql = `INSERT INTO ${tableUser} (${quotedKeys.join(
          ", "
        )}) VALUES ${placeHolders.join(", ")}`;
        sql += this._buildReturning();
        break;

      case "UPDATE":
        if (this._joins.length > 0) throw new Error("UPDATE does not support JOINS directly (use subqueries or raw SQL)");
        if (!this._data) throw new Error("No data provided for UPDATE");
        
        const updateKeys = Object.keys(this._data);
        if (updateKeys.length === 0) throw new Error("No columns to update");

        const setClauses = updateKeys.map((key) => {
          values.push((this._data as any)[key]);
          return `${this._quote(key)} = $${values.length}`;
        });

        sql = `UPDATE ${tableUser} SET ${setClauses.join(", ")}`;
        sql += this._buildWhere(values);
        sql += this._buildReturning();
        break;

      case "DELETE":
        if (this._joins.length > 0) throw new Error("DELETE does not support JOINS directly");
        sql = `DELETE FROM ${tableUser}`;
        sql += this._buildWhere(values);
        sql += this._buildReturning();
        break;
    }

    return { sql, values };
  }
}
