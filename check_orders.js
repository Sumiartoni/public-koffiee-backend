import db from './db.js';

async function check() {
    try {
        // Wait a bit for DB to init
        await new Promise(r => setTimeout(r, 2000));

        console.log("Fetching last 5 orders...");
        const orders = await db.all('SELECT id, order_number, status, payment_status, order_type, payment_method FROM orders ORDER BY id DESC LIMIT 5');
        console.log(JSON.stringify(orders, null, 2));
    } catch (e) {
        console.error("Error fetching orders:", e);
    } finally {
        process.exit(0);
    }
}

check();
