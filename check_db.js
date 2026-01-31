import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const db = new Database(join(__dirname, 'coffee-pos.db'));

const orders = db.prepare("SELECT id, order_number, status, created_at FROM orders").all();
console.log("Total Orders:", orders.length);
console.log("Details:", JSON.stringify(orders, null, 2));
