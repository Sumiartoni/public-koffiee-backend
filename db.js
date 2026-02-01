// import Database from 'better-sqlite3'; // Commented - using PostgreSQL in production
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import dotenv from 'dotenv';

dotenv.config();
const require = createRequire(import.meta.url);
const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL;

class DBAdapter {
    constructor() {
        this.init();
    }

    async init() {
        this.type = isProduction ? 'postgres' : 'sqlite';
        console.log(`🔌 Database Mode: ${this.type.toUpperCase()}`);

        if (this.type === 'sqlite') {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            this.sqlite = new Database(join(__dirname, 'coffee-pos.db'));
            this.sqlite.pragma('foreign_keys = ON');
            this.initLocalWithTables();
        } else {
            try {
                const pg = await import('pg');
                const { Pool } = pg.default;
                this.pool = new Pool({
                    connectionString: process.env.DATABASE_URL,
                    ssl: { rejectUnauthorized: false }
                });
                const test = await this.pool.query('SELECT NOW()');
                console.log(`✅ Supabase Connected at: ${test.rows[0].now}`);
            } catch (e) {
                console.error("❌ Database Connection FAILED:", e.message);
            }
        }
    }

    initLocalWithTables() {
        // SQLite initialization logic stays for local dev
        const tables = [
            `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, name TEXT, role TEXT, is_active INTEGER DEFAULT 1, phone TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
            `CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, slug TEXT UNIQUE, emoji TEXT, display_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1)`,
            `CREATE TABLE IF NOT EXISTS menu_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, category_id INTEGER, price INTEGER, hpp INTEGER DEFAULT 0, hpp_type TEXT, emoji TEXT, description TEXT, image_url TEXT, is_available INTEGER DEFAULT 1, display_order INTEGER DEFAULT 0)`,
            `CREATE TABLE IF NOT EXISTS ingredients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, unit TEXT, price_per_unit INTEGER, stock_qty REAL, min_stock REAL)`,
            `CREATE TABLE IF NOT EXISTS recipes (id INTEGER PRIMARY KEY AUTOINCREMENT, menu_item_id INTEGER, ingredient_id INTEGER, quantity REAL)`,
            `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT UNIQUE, customer_name TEXT, customer_phone TEXT, customer_address TEXT, cashier_name TEXT, order_type TEXT, table_number TEXT, status TEXT, payment_status TEXT, payment_method TEXT, subtotal INTEGER, discount INTEGER, tax INTEGER, total INTEGER, total_hpp INTEGER, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
            `CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, menu_item_id INTEGER, menu_item_name TEXT, quantity INTEGER, price INTEGER, hpp INTEGER, subtotal INTEGER, notes TEXT, extras TEXT)`,
            `CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, expense_date DATE, category TEXT, description TEXT, amount INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
            `CREATE TABLE IF NOT EXISTS expense_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, emoji TEXT, is_active INTEGER DEFAULT 1)`
        ];
        tables.forEach(sql => this.sqlite.exec(sql));
    }

    async query(sql, params = []) {
        if (this.type === 'sqlite') {
            try {
                const isSelect = /^\s*SELECT/i.test(sql);
                const stmt = this.sqlite.prepare(sql.replace(/\$\d+/g, '?')); // Support both $1 and ? for compatibility
                if (isSelect) {
                    const result = stmt.all(params);
                    return { rows: result, rowCount: result.length };
                } else {
                    const info = stmt.run(params);
                    return { rows: [], rowCount: info.changes, lastId: info.lastInsertRowid };
                }
            } catch (err) {
                console.error("SQLite Error:", err.message, sql);
                throw err;
            }
        } else {
            // Postgres Logic
            // Ensure $n notation is used. If ? is found, convert it.
            let paramIdx = 1;
            const pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);

            try {
                const res = await this.pool.query(pgSql, params);
                // Extract lastId from RETURNING id if present
                const lastId = (res.rows && res.rows[0] && res.rows[0].id) ? res.rows[0].id : null;
                return { rows: res.rows, rowCount: res.rowCount, lastId };
            } catch (err) {
                console.error("Postgres Error:", err.message, pgSql);
                throw err;
            }
        }
    }

    async get(sql, params = []) {
        const res = await this.query(sql, params);
        return res.rows[0] || null;
    }

    async all(sql, params = []) {
        const res = await this.query(sql, params);
        return res.rows;
    }

    async run(sql, params = []) {
        return await this.query(sql, params);
    }
}

const db = new DBAdapter();
export default db;
