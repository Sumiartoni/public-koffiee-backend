import db from './db.js';
import bcrypt from 'bcryptjs';

async function fixAdminPassword() {
    console.log('🔧 Fixing Admin Password...');

    // Hash 'admin123' properly
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Update Admin
    try {
        if (db.type === 'sqlite') {
            db.sqlite.prepare('UPDATE users SET password = ? WHERE username = ?').run(hashedPassword, 'admin');
            console.log('✅ Updated admin password (SQLite)');

            // Fix Kasir too
            const hashedKasir = await bcrypt.hash('kasir123', 10);
            db.sqlite.prepare('UPDATE users SET password = ? WHERE username = ?').run(hashedKasir, 'kasir');
            console.log('✅ Updated kasir password (SQLite)');
        } else {
            await db.pool.query('UPDATE users SET password = $1 WHERE username = $2', [hashedPassword, 'admin']);
            // ... Postgres logic if needed
            console.log('✅ Updated admin password (Postgres)');
        }
    } catch (e) {
        console.error('❌ Error updating password:', e);
    }
}

fixAdminPassword();
