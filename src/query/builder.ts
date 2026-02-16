
import { DatabaseAdapter } from "../core/adapter";
import { TableSchema, InferTableType } from "../types/schema";

type WhereOperator = "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "IN";

interface WhereClause<T> {
  column: keyof T;
  operator: WhereOperator;
  value: any;
}

export class QueryBuilder<TTable extends Record<string, any>, TResult = TTable> {
  private _table: string;
  private _adapter: DatabaseAdapter;
  private _select: (keyof TTable)[] = [];
  private _where: WhereClause<TTable>[] = [];
  private _limit?: number;
  private _offset?: number;

  constructor(table: string, adapter: DatabaseAdapter) {
    this._table = table;
    this._adapter = adapter;
  }

  /**
   * Specify columns to select.
   * If not called, defaults to * (all columns).
   */
  select<K extends keyof TTable>(...columns: K[]): QueryBuilder<TTable, Pick<TTable, K>> {
    this._select = columns;
    // We return a new instance (or cast existing) with the new result type
    return this as unknown as QueryBuilder<TTable, Pick<TTable, K>>;
  }

  /**
   * Add a WHERE condition.
   * Supports filtering on any column of the original table.
   */
  where<K extends keyof TTable>(column: K, operator: WhereOperator, value: TTable[K]): this {
    this._where.push({ column, operator, value });
    return this;
  }

  /**
   * Limit the number of results.
   */
  limit(limit: number): this {
    this._limit = limit;
    return this;
  }

  /**
   * Skip a number of results.
   */
  offset(offset: number): this {
    this._offset = offset;
    return this;
  }

  /**
   * Execute the query and return the results.
   */
  async execute(): Promise<TResult[]> {
    const { sql, values } = this.toSQL();
    const result = await this._adapter.query<TResult>(sql, values);
    return result.rows;
  }

  /**
   * Enable await-ing the query builder directly.
   */
  then<TResult1 = TResult[], TResult2 = never>(
    onfulfilled?: ((value: TResult[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  /**
   * Generate the SQL string and parameters.
   */
  toSQL(): { sql: string; values: any[] } {
    const columns = this._select.length > 0 ? this._select.join(", ") : "*";
    let sql = `SELECT ${columns} FROM ${this._table}`;
    const values: any[] = [];

    if (this._where.length > 0) {
      const clauses = this._where.map((clause, index) => {
        values.push(clause.value);
        return `${String(clause.column)} ${clause.operator} $${index + 1}`;
      });
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }

    if (this._limit !== undefined) {
      sql += ` LIMIT ${this._limit}`;
    }

    if (this._offset !== undefined) {
      sql += ` OFFSET ${this._offset}`;
    }

    return { sql, values };
  }
}

