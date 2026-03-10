import { DatabaseAdapter, QueryResult } from "../core/adapter.js";

/**
 * Whether we are running under the Bun runtime.
 * @internal
 */
const isBun = typeof globalThis !== "undefined" && "Bun" in globalThis;

/**
 * Adapter for SQLite databases.
 *
 * - **Node.js**: Uses `better-sqlite3` (must be installed separately).
 * - **Bun**: Uses the built-in `bun:sqlite` module automatically.
 *
 * @example
 * ```typescript
 * import { SqliteAdapter } from 'pawql';
 *
 * const adapter = new SqliteAdapter('mydatabase.db'); // or ':memory:'
 * ```
 */
export class SqliteAdapter implements DatabaseAdapter {
  private _db?: any;
  private _dbPath: string;
  private _options?: any;
  private _isBun: boolean = isBun;

  // Keep track of whether we are inside a transaction
  private _inTransaction: boolean = false;

  constructor(filename: string, options?: any);
  constructor(dbInstance: any);
  constructor(filenameOrInstance: any, options?: any) {
    if (typeof filenameOrInstance === "string") {
      this._dbPath = filenameOrInstance;
      this._options = options;
    } else {
      this._db = filenameOrInstance;
      this._dbPath = "";
    }
  }

  get dialect() {
    return "sqlite" as const;
  }

  private async _getDb(): Promise<any> {
    if (this._db) return this._db;

    if (this._isBun) {
      try {
        // Bun has built-in SQLite via bun:sqlite
        const { Database } = await import("bun:sqlite");
        this._db = new Database(this._dbPath, this._options);
      } catch (e) {
        throw new Error(
          "Could not load bun:sqlite. Are you running under Bun?"
        );
      }
    } else {
      try {
        // Node.js uses better-sqlite3
        // @ts-ignore — better-sqlite3 may not have types installed
        const Database = (await import("better-sqlite3")).default;
        this._db = new Database(this._dbPath, this._options);
      } catch (e) {
        throw new Error(
          "Could not load better-sqlite3. Please install it with: npm install better-sqlite3"
        );
      }
    }

    return this._db;
  }

  /**
   * Internal constructor for transactions.
   * @internal
   */
  static _forTransaction(db: any, useBun: boolean): SqliteAdapter {
    const adapter = new SqliteAdapter(db);
    adapter._inTransaction = true;
    adapter._isBun = useBun;
    return adapter;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const db = await this._getDb();

    // Replace PostgreSQL $1, $2 placeholders with ?
    const sqliteSql = sql.replace(/\$\d+/g, "?");

    // Convert JS types to SQLite-compatible values
    const boundParams = (params || []).map((p) => {
      if (typeof p === "boolean") return p ? 1 : 0;
      if (p instanceof Date) return p.toISOString();
      if (p === null || p === undefined) return null;
      if (typeof p === "object" && !Array.isArray(p)) return JSON.stringify(p);
      return p;
    });

    const isSelect = sqliteSql.trimStart().toUpperCase().startsWith("SELECT");
    const isPragma = sqliteSql.trimStart().toUpperCase().startsWith("PRAGMA");
    const hasReturning = sqliteSql.toUpperCase().includes("RETURNING");

    if (isSelect || hasReturning || isPragma) {
      return this._queryAll<T>(db, sqliteSql, boundParams);
    } else {
      return this._queryRun<T>(db, sqliteSql, boundParams);
    }
  }

  /**
   * Execute a query that returns rows (SELECT, RETURNING, PRAGMA).
   * @internal
   */
  private _queryAll<T>(db: any, sql: string, params: any[]): QueryResult<T> {
    if (this._isBun) {
      // bun:sqlite: db.query(sql).all(...params)
      const stmt = db.query(sql);
      const rows = stmt.all(...params);
      return { rows: rows as T[], rowCount: rows.length };
    } else {
      // better-sqlite3: db.prepare(sql).all(...params)
      const stmt = db.prepare(sql);
      const rows = stmt.all(...params);
      return { rows: rows as T[], rowCount: rows.length };
    }
  }

  /**
   * Execute a query that modifies data (INSERT, UPDATE, DELETE, DDL).
   * @internal
   */
  private _queryRun<T>(db: any, sql: string, params: any[]): QueryResult<T> {
    if (this._isBun) {
      // bun:sqlite: db.run(sql, params) → { changes, lastInsertRowid }
      const info = db.run(sql, params);
      return { rows: [], rowCount: info.changes ?? 0 };
    } else {
      // better-sqlite3: db.prepare(sql).run(...params) → { changes }
      const stmt = db.prepare(sql);
      const info = stmt.run(...params);
      return { rows: [], rowCount: info.changes };
    }
  }

  async transaction<T>(
    callback: (trx: DatabaseAdapter) => Promise<T>
  ): Promise<T> {
    const db = await this._getDb();

    if (this._inTransaction) {
      return callback(this);
    }

    const trxAdapter = SqliteAdapter._forTransaction(db, this._isBun);

    if (this._isBun) {
      db.run("BEGIN");
    } else {
      db.prepare("BEGIN").run();
    }

    try {
      const result = await callback(trxAdapter);
      if (this._isBun) {
        db.run("COMMIT");
      } else {
        db.prepare("COMMIT").run();
      }
      return result;
    } catch (e) {
      if (this._isBun) {
        db.run("ROLLBACK");
      } else {
        db.prepare("ROLLBACK").run();
      }
      throw e;
    }
  }

  async close(): Promise<void> {
    if (this._db && typeof this._db.close === "function") {
      this._db.close();
    }
  }
}
