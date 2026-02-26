import { DatabaseAdapter } from "../core/adapter.js";
import { DatabaseSchema, InferTableType } from "../types/schema.js";

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
  | "BETWEEN"
  | "EXISTS"
  | "NOT EXISTS";

type WhereValue = any;

interface WhereClause<T> {
  type: "AND" | "OR";
  column: keyof T | string;
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

interface HavingClause {
  raw: string;
  values: any[];
}

interface OnConflictConfig {
  columns: string[];
  action: "DO NOTHING" | "DO UPDATE";
  updateData?: Record<string, any>;
}

type WhereCondition<T> = {
  [K in keyof T]?:
    | T[K]
    | { in: T[K][] }
    | { like: string }
    | { ilike: string }
    | { gt: T[K] }
    | { lt: T[K] }
    | { gte: T[K] }
    | { lte: T[K] }
    | { not: T[K] }
    | { between: [T[K], T[K]] }
    | { subquery: SubqueryDef }
    | null;
};

// Generic Where for Joined tables (keys are strings like 'users.id')
type JoinedWhereCondition = Record<string, any>;

// Operation types
type Operation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

/**
 * A subquery definition created by the `subquery()` helper.
 * This carries a builder that will be rendered as a nested SQL fragment.
 */
export interface SubqueryDef {
  readonly _isSubquery: true;
  readonly _builder: QueryBuilder<any, any, any>;
  readonly _alias?: string;
}

/**
 * Create a subquery from a query builder.
 * Usage: `subquery(db.query('orders')).as('recent_orders')`
 */
export function subquery<T extends Record<string, any>>(builder: QueryBuilder<T, any, any>): SubqueryDef & { as(alias: string): SubqueryDef } {
  const def: SubqueryDef = { _isSubquery: true, _builder: builder };
  return {
    ...def,
    as(alias: string): SubqueryDef {
      return { _isSubquery: true, _builder: builder, _alias: alias };
    },
  };
}

/**
 * Fluent, type-safe SQL query builder.
 * Supports SELECT, INSERT, UPDATE, DELETE with filtering, joins, aggregation,
 * subqueries, upserts, and more.
 *
 * @typeParam TTable - The table row type (inferred from schema)
 * @typeParam TResult - The result row type (may differ due to joins/select)
 * @typeParam TSchema - The full database schema type
 */
export class QueryBuilder<
  TTable extends Record<string, any>,
  TResult = TTable,
  TSchema extends DatabaseSchema = any 
> {
  private _table: string;
  private _adapter: DatabaseAdapter;
  private _operation: Operation = "SELECT";
  private _data: Partial<TTable> | Partial<TTable>[] | null = null;
  private _select: string[] = [];
  private _where: WhereClause<any>[] = [];
  private _joins: JoinClause[] = [];
  private _orderByClauses: OrderByClause[] = [];
  private _groupByCols: string[] = [];
  private _havingClauses: HavingClause[] = [];
  private _onConflict?: OnConflictConfig;
  private _fromSubquery?: SubqueryDef;
  private _limit?: number;
  private _offset?: number;
  private _returning: boolean | string[] = false;

  /** @internal */
  constructor(table: string, adapter: DatabaseAdapter) {
    this._table = table;
    this._adapter = adapter;
  }

  // --- CRUD Operations ---

  /**
   * Insert one or more rows into the table.
   * Defaults to `RETURNING *`.
   *
   * @param data - A single row object or an array of row objects
   * @returns The builder for chaining
   *
   * @example
   * ```typescript
   * await db.query('users').insert({ id: 1, name: 'Alice' }).execute();
   * ```
   */
  insert(data: Partial<TTable> | Partial<TTable>[]): this {
    this._operation = "INSERT";
    this._data = data;
    this._returning = true;
    return this;
  }

  /**
   * Update rows in the table. Typically used with `.where()`.
   * Defaults to `RETURNING *`.
   *
   * @param data - An object of column-value pairs to update
   * @returns The builder for chaining
   *
   * @example
   * ```typescript
   * await db.query('users').update({ name: 'Bob' }).where({ id: 1 }).execute();
   * ```
   */
  update(data: Partial<TTable>): this {
    this._operation = "UPDATE";
    this._data = data;
    this._returning = true;
    return this;
  }

  /**
   * Delete rows from the table. Typically used with `.where()`.
   * Defaults to `RETURNING *`.
   *
   * @returns The builder for chaining
   *
   * @example
   * ```typescript
   * await db.query('users').delete().where({ id: 1 }).execute();
   * ```
   */
  delete(): this {
    this._operation = "DELETE";
    this._returning = true;
    return this;
  }

  // --- Joins ---

  /**
   * Perform an INNER JOIN with another table.
   * Only rows with matching values in both tables are returned.
   *
   * @param table - The table to join
   * @param col1 - Left-side column (e.g. `'users.id'`)
   * @param operator - Comparison operator (typically `'='`)
   * @param col2 - Right-side column (e.g. `'posts.userId'`)
   *
   * @example
   * ```typescript
   * db.query('users').innerJoin('posts', 'users.id', '=', 'posts.userId')
   * ```
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
   * Perform a LEFT JOIN with another table.
   * All rows from the left table are returned; joined columns may be `null`.
   *
   * @param table - The table to join
   * @param col1 - Left-side column
   * @param operator - Comparison operator
   * @param col2 - Right-side column
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

  /**
   * Perform a RIGHT JOIN with another table.
   * All rows from the right table are returned; left columns may be `null`.
   */
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

  /**
   * Perform a FULL OUTER JOIN with another table.
   * All rows from both tables are returned; non-matching columns may be `null`.
   */
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

  /**
   * Specify which columns to select.
   * If not called, defaults to `SELECT *`.
   *
   * @param columns - Column names to select
   *
   * @example
   * ```typescript
   * db.query('users').select('id', 'name')
   * ```
   */
  select(
    ...columns: string[]
  ): QueryBuilder<TTable, TResult, TSchema> {
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
      } else if (val && typeof val === "object" && "_isSubquery" in val && val._isSubquery) {
        // Subquery in WHERE: { column: { subquery: subquery(builder) } }
        this._where.push({ type, column, operator: "IN", value: val });
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
        if ("subquery" in ops)
          this._where.push({ type, column, operator: "IN", value: ops.subquery });
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

  /**
   * Add GROUP BY clause.
   * @param columns One or more column names to group by
   */
  groupBy(...columns: (string & keyof TTable | string)[]): this {
    this._groupByCols.push(...columns);
    return this;
  }

  /**
   * Add HAVING clause (used after GROUP BY).
   * @param condition Raw SQL condition string (e.g. 'COUNT(*) > $1')
   * @param params Parameter values for placeholders
   */
  having(condition: string, ...params: any[]): this {
    this._havingClauses.push({ raw: condition, values: params });
    return this;
  }

  /**
   * Specify ON CONFLICT columns for upsert.
   * Chain with `.doUpdate(data)` or `.doNothing()`.
   */
  onConflict(...columns: (string & keyof TTable | string)[]): {
    doUpdate: (data: Partial<TTable>) => QueryBuilder<TTable, TResult, TSchema>;
    doNothing: () => QueryBuilder<TTable, TResult, TSchema>;
  } {
    const self = this;
    return {
      doUpdate(data: Partial<TTable>) {
        self._onConflict = {
          columns,
          action: "DO UPDATE",
          updateData: data as Record<string, any>,
        };
        return self;
      },
      doNothing() {
        self._onConflict = {
          columns,
          action: "DO NOTHING",
        };
        return self;
      },
    };
  }

  /**
   * Use a subquery as the FROM source.
   * @param sub A subquery created with `subquery(builder).as('alias')`
   */
  from(sub: SubqueryDef): this {
    this._fromSubquery = sub;
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

      if ((clause.operator === "IN" || clause.operator === "NOT IN") && clause.value && typeof clause.value === "object" && "_isSubquery" in clause.value) {
        // Subquery in WHERE
        const subDef = clause.value as SubqueryDef;
        const { sql: subSql, values: subValues } = subDef._builder.toSQL();
        // Rebase subquery param indexes
        const rebased = this._rebaseSubqueryParams(subSql, subValues, values);
        condition = `${col} ${clause.operator} (${rebased})`;
      } else if (clause.operator === "EXISTS" || clause.operator === "NOT EXISTS") {
        const subDef = clause.value as SubqueryDef;
        const { sql: subSql, values: subValues } = subDef._builder.toSQL();
        const rebased = this._rebaseSubqueryParams(subSql, subValues, values);
        condition = `${clause.operator} (${rebased})`;
      } else if (clause.operator === "IN" || clause.operator === "NOT IN") {
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

  /**
   * Rebase subquery parameter placeholders so they don't conflict
   * with the outer query's parameter indexes.
   */
  private _rebaseSubqueryParams(subSql: string, subValues: any[], outerValues: any[]): string {
    const offset = outerValues.length;
    outerValues.push(...subValues);
    // Replace $1, $2, ... with $offset+1, $offset+2, ...
    return subSql.replace(/\$(\d+)/g, (_, num) => `$${Number(num) + offset}`);
  }

  // Helper to build JOIN clause (extracted for reuse in count)
  private _buildJoins(): string {
    if (this._joins.length === 0) return "";
    return " " + this._joins.map(j => {
      return `${j.type} JOIN ${this._quote(j.table)} ON ${this._quote(j.on.col1)} ${j.on.op} ${this._quote(j.on.col2)}`;
    }).join(" ");
  }

  // Helper to build GROUP BY clause
  private _buildGroupBy(): string {
    if (this._groupByCols.length === 0) return "";
    const cols = this._groupByCols.map(c => this._quote(c));
    return ` GROUP BY ${cols.join(", ")}`;
  }

  // Helper to build HAVING clause
  private _buildHaving(values: any[]): string {
    if (this._havingClauses.length === 0) return "";
    const parts = this._havingClauses.map(h => {
      let cond = h.raw;
      // Rebase the placeholders
      for (const v of h.values) {
        values.push(v);
        cond = cond.replace(/\$\d+/, `$${values.length}`);
      }
      return cond;
    });
    return ` HAVING ${parts.join(" AND ")}`;
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

  // Helper to build ON CONFLICT clause
  private _buildOnConflict(values: any[]): string {
    if (!this._onConflict) return "";
    const cols = this._onConflict.columns.map(c => this._quote(c)).join(", ");
    if (this._onConflict.action === "DO NOTHING") {
      return ` ON CONFLICT (${cols}) DO NOTHING`;
    }
    // DO UPDATE
    if (!this._onConflict.updateData) {
      throw new Error("ON CONFLICT DO UPDATE requires update data");
    }
    const setClauses = Object.entries(this._onConflict.updateData).map(([key, val]) => {
      values.push(val);
      return `${this._quote(key)} = $${values.length}`;
    });
    return ` ON CONFLICT (${cols}) DO UPDATE SET ${setClauses.join(", ")}`;
  }

  toSQL(): { sql: string; values: any[] } {
    const columns = this._select.length > 0
        ? this._select.map(c => this._quote(c)).join(", ")
        : "*";
    const tableUser = this._quote(this._table);
    const values: any[] = [];
    let sql = "";

    switch (this._operation) {
      case "SELECT": {
        // Support FROM subquery
        if (this._fromSubquery) {
          const subDef = this._fromSubquery;
          const { sql: subSql, values: subValues } = subDef._builder.toSQL();
          const rebased = this._rebaseSubqueryParams(subSql, subValues, values);
          const alias = subDef._alias || "sub";
          sql = `SELECT ${columns} FROM (${rebased}) AS ${this._quote(alias)}`;
        } else {
          sql = `SELECT ${columns} FROM ${tableUser}`;
        }
        sql += this._buildJoins();
        sql += this._buildWhere(values);
        sql += this._buildGroupBy();
        sql += this._buildHaving(values);
        sql += this._buildOrderBy();
        if (this._limit !== undefined) sql += ` LIMIT ${this._limit}`;
        if (this._offset !== undefined) sql += ` OFFSET ${this._offset}`;
        break;
      }

      case "INSERT": {
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
        sql += this._buildOnConflict(values);
        sql += this._buildReturning();
        break;
      }

      case "UPDATE": {
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
      }

      case "DELETE": {
        if (this._joins.length > 0) throw new Error("DELETE does not support JOINS directly");
        sql = `DELETE FROM ${tableUser}`;
        sql += this._buildWhere(values);
        sql += this._buildReturning();
        break;
      }
    }

    return { sql, values };
  }
}
