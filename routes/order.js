import express from 'express';
import db from '../db.js';

const router = express.Router();

// Generate Order Number: ORD-YYYYMMDD-XXXX
async function generateOrderNumber() {
    try {
        const now = new Date();
        const jktTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        const dateStr = jktTime.toISOString().slice(0, 10).replace(/-/g, '');

        const sql = `SELECT order_number FROM orders WHERE order_number LIKE $1 ORDER BY id DESC LIMIT 1`;
        const lastOrder = await db.get(sql, [`ORD-${dateStr}-%`]);

        let sequence = 1;
        if (lastOrder && lastOrder.order_number) {
            const parts = lastOrder.order_number.split('-');
            if (parts.length === 3) {
                const lastSeq = parseInt(parts[2]);
                if (!isNaN(lastSeq)) sequence = lastSeq + 1;
            }
        }
        return `ORD-${dateStr}-${String(sequence).padStart(4, '0')}`;
    } catch (e) {
        console.error("[GENERATE ORDER NO ERROR]", e);
        return `ORD-${Date.now()}`; // Fallback unique ID
    }
}

router.post('/', async (req, res) => {
    const { customer_name, items, payment_method, order_type, table_number, notes, discount, address, customer_phone } = req.body;

    console.log(`\n--- NEW ORDER ATTEMPT ---`);
    console.log(`Cust: ${customer_name}, Type: ${order_type}, Items: ${items?.length}`);

    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Keranjang kosong' });
    }

    try {
        const orderNumber = await generateOrderNumber();
        console.log(`Generated No: ${orderNumber}`);

        let subtotal = 0;
        let totalHpp = 0;
        const validItems = [];

        // Check if status is explicitly provided (e.g. from POS)
        // If not, default to 'pending' for ALL web/online orders to ensure confirmation is needed.
        let finalStatus = req.body.status || 'pending';
        let finalPaymentStatus = req.body.payment_status || 'unpaid';

        // Override for specific logic if needed, but prioritizing client intent allows POS to force 'completed'
        if (!req.body.status) {
            if (order_type === 'online' || order_type === 'booking') {
                finalStatus = 'pending';
                finalPaymentStatus = 'unpaid';
            }
        }


        const tax = 0;
        const total = subtotal - (Number(discount) || 0);

        console.log(`Calculated Total: ${total} for ${validItems.length} valid items`);

        // INSERT WITH EXPLICIT TYPES AND RETURNING
        const insertSql = `
            INSERT INTO orders (
                order_number, customer_name, customer_phone, customer_address, 
                order_type, table_number, payment_method, payment_status, status, 
                subtotal, tax, discount, total, total_hpp, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id
        `;

        const insertParams = [
            orderNumber,
            String(customer_name || 'Walk-in Customer'),
            String(customer_phone || ''),
            String(address || ''),
            String(order_type || 'online'),
            String(table_number || '-'),
            String(payment_method || 'cash'),
            finalPaymentStatus,
            finalStatus,
            Math.round(subtotal),
            Math.round(tax),
            Math.round(Number(discount) || 0),
            Math.round(total),
            Math.round(totalHpp),
            String(notes || '')
        ];

        const result = await db.run(insertSql, insertParams);
        const orderId = (result.rows && result.rows[0]) ? result.rows[0].id : null;

        if (!orderId) {
            throw new Error("Gagal menyimpan pesanan utama ke database (No Order ID returned)");
        }

        console.log(`Saved Order ID: ${orderId}`);

        // INSERT ITEMS
        for (const item of validItems) {
            const itemSql = `
                INSERT INTO order_items (
                    order_id, menu_item_id, menu_item_name, quantity, price, hpp, subtotal, notes, extras
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `;
            const extrasStr = (typeof item.extras === 'string') ? item.extras : JSON.stringify(item.extras || null);

            await db.run(itemSql, [
                orderId,
                item.menu_item_id,
                item.name,
                item.quantity,
                item.price,
                item.hpp,
                item.subtotal,
                item.notes,
                extrasStr
            ]);
        }

        console.log(`All items saved for order ${orderNumber}`);

        const io = req.app.get('io');
        const fullOrder = await db.get('SELECT * FROM orders WHERE id = $1', [orderId]);
        if (fullOrder) {
            fullOrder.items = await db.all('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
            if (io) {
                console.log(`Broadcasting new-order via Socket.IO`);
                io.emit('new-order', fullOrder);
            }
        }

        res.status(201).json({
            message: 'Order successful',
            order_number: orderNumber,
            id: orderId,
            order: fullOrder
        });

    } catch (err) {
        console.error('CRITICAL ORDER ERROR:', err);
        res.status(500).json({ error: 'Terjadi kesalahan sistem saat memproses pesanan.', detail: err.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const orders = await db.all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100');
        for (let o of orders) {
            o.items = await db.all('SELECT * FROM order_items WHERE order_id = $1', [Number(o.id)]);
        }
        res.json({ orders });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        await db.run('UPDATE orders SET status = $1, payment_status = $2 WHERE id = $3',
            [status, status === 'completed' ? 'paid' : 'unpaid', Number(req.params.id)]);
        const io = req.app.get('io');
        if (io) io.emit('order-updated', { id: req.params.id, status });
        res.json({ message: 'Status updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pending', async (req, res) => {
    try {
        const orders = await db.all("SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC");
        for (let o of orders) {
            o.items = await db.all('SELECT * FROM order_items WHERE order_id = $1', [Number(o.id)]);
        }
        res.json({ orders });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        const order = await db.get('SELECT * FROM orders WHERE id = $1', [orderId]);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const orderItems = await db.all('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
        for (const item of orderItems) {
            const recipes = await db.all('SELECT * FROM recipes WHERE menu_item_id = $1', [item.menu_item_id]);
            for (const recipe of recipes) {
                const restoreQty = Number(recipe.quantity) * Number(item.quantity);
                await db.run('UPDATE ingredients SET stock_qty = stock_qty + $1 WHERE id = $2', [restoreQty, recipe.ingredient_id]);
            }
        }

        await db.run("UPDATE orders SET status = 'cancelled' WHERE id = $1", [orderId]);
        const io = req.app.get('io');
        if (io) io.emit('order-deleted', { id: orderId, status: 'cancelled' });
        res.json({ message: 'Order cancelled' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/today', async (req, res) => {
    try {
        // Get today's date in Asia/Jakarta (UTC+7)
        const todayStr = new Date(new Date().getTime() + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);

        console.log(`[STATS] Fetching today's stats for date: ${todayStr}`);

        const stats = await db.get(`
            SELECT 
                COUNT(*) as total_orders, 
                COALESCE(SUM(total), 0) as total_sales,
                COALESCE(SUM(total_hpp), 0) as total_cogs 
            FROM orders 
            WHERE status IN ('completed', 'pending') 
            AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date = $1::date
        `, [todayStr]);

        res.json(stats);
    } catch (err) {
        console.error("[STATS ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
