import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'coffee-pos.db'));

try {
    db.prepare("UPDATE users SET is_verified = 1 WHERE username = 'admin'").run();
    console.log("✅ Admin verified in Database.");
} catch (e) {
    console.error("❌ Error:", e.message);
}
