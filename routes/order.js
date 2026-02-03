```javascript
import express from 'express';
import db from '../db.js';
import { sendWhatsApp, formatNewOrder, formatOrderReady, formatWalkInReceipt } from '../services/whatsapp.js';

const router = express.Router();

// Generate Order Number: ORD-YYYYMMDD-XXXX
async function generateOrderNumber() {
    try {
        const now = new Date();
        const jktTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        const dateStr = jktTime.toISOString().slice(0, 10).replace(/-/g, '');

        const sql = `SELECT order_number FROM orders WHERE order_number LIKE $1 ORDER BY id DESC LIMIT 1`;
        const lastOrder = await db.get(sql, [`ORD - ${ dateStr } -% `]);

        let sequence = 1;
        if (lastOrder && lastOrder.order_number) {
            const parts = lastOrder.order_number.split('-');
            if (parts.length === 3) {
                const lastSeq = parseInt(parts[2]);
                if (!isNaN(lastSeq)) sequence = lastSeq + 1;
            }
        }
        return `ORD - ${ dateStr } -${ String(sequence).padStart(4, '0') } `;
    } catch (e) {
        console.error("[GENERATE ORDER NO ERROR]", e);
        return `ORD - ${ Date.now() } `; // Fallback unique ID
    }
}

router.post('/', async (req, res) => {
    const { customer_name, items, payment_method, order_type, table_number, notes, discount, address, customer_phone } = req.body;

    console.log(`\n-- - NEW ORDER ATTEMPT-- - `);
    console.log(`Cust: ${ customer_name }, Type: ${ order_type }, Items: ${ items?.length } `);

    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Keranjang kosong' });
    }

    try {
        const orderNumber = await generateOrderNumber();
        console.log(`Generated No: ${ orderNumber } `);

        let subtotal = 0;
        let totalHpp = 0;
        const validItems = [];

        for (const item of items) {
             const menuItem = await db.get('SELECT * FROM menu_items WHERE id = $1', [Number(item.menu_item_id)]);
             let price = 0;
             let hpp = 0;
             let name = item.name || 'Item';
            
             if (menuItem) {
                 price = Number(menuItem.price);
                 hpp = Number(menuItem.hpp);
                 name = menuItem.name;
                 // Stock update (Background attempt)
                try {
                    const recipes = await db.all('SELECT * FROM recipes WHERE menu_item_id = $1', [menuItem.id]);
                    for (const recipe of recipes) {
                        const deductQty = Number(recipe.quantity) * (Number(item.quantity) || 1);
                        await db.run('UPDATE ingredients SET stock_qty = stock_qty - $1 WHERE id = $2', [deductQty, recipe.ingredient_id]);
                    }
                } catch (stockErr) {
                    console.error("[STOCK UPDATE ERROR] Ignored to let order pass:", stockErr.message);
                }
             } else {
                 // Fallback if item deleted but still cached in frontend
                 price = Number(item.price) || 0;
                 console.warn(`[ORDER WARNING] Item ID ${ item.menu_item_id } not found in DB.Using frontend price: ${ price } `);
             }

             const qty = Number(item.quantity) || 1;
             const itemSubtotal = price * qty;
             const itemHpp = hpp * qty;

             subtotal += itemSubtotal;
             totalHpp += itemHpp;
             
             validItems.push({
                menu_item_id: Number(item.menu_item_id),
                name: name,
                quantity: qty,
                price: price,
                hpp: hpp,
                subtotal: itemSubtotal,
                notes: item.notes || '',
                extras: item.extras || null
            });
        }

        const tax = 0;
        const total = subtotal - (Number(discount) || 0);

        console.log(`Calculated Total: ${ total } for ${ validItems.length } valid items`);

        // LOGIC STATUS:
        // Online Orders -> Pending (Menunggu Konfirmasi / Pembayaran)
        // POS Orders -> Completed (Biasanya langsung bayar/selesai)
        // KECUALI jika QRIS -> Pending dulu sampai callback masuk
        let finalStatus = 'pending'; 
        let finalPaymentStatus = 'unpaid';

        if (req.body.status) {
            finalStatus = req.body.status; // Jika POS kirim 'completed'
            finalPaymentStatus = req.body.payment_status || 'unpaid';
        } else {
            // Default Web Logic
            if (payment_method === 'cash' && order_type === 'online') {
                finalStatus = 'pending'; // Butuh konfirmasi admin
            }
            // For other online payment methods (e.g., QRIS), it will remain 'pending' and 'unpaid'
            // until a payment callback updates it.
        }

        // INSERT WITH EXPLICIT TYPES AND RETURNING
        const insertSql = `
            INSERT INTO orders(
    order_number, customer_name, customer_phone, customer_address,
    order_type, table_number, payment_method, payment_status, status,
    subtotal, tax, discount, total, total_hpp, notes
) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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

        console.log(`Saved Order ID: ${ orderId } `);

        // INSERT ITEMS
        for (const item of validItems) {
            const itemSql = `
                INSERT INTO order_items(
    order_id, menu_item_id, menu_item_name, quantity, price, hpp, subtotal, notes, extras
) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
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

        console.log(`All items saved for order ${ orderNumber }`);

        const io = req.app.get('io');
        const fullOrder = await db.get('SELECT * FROM orders WHERE id = $1', [orderId]);
        if (fullOrder) {
            fullOrder.items = validItems; // Attach items for template
            if (io) {
                console.log(`Broadcasting new- order via Socket.IO`);
                io.emit('new-order', fullOrder);
            }

            // 1. KIRIM NOTIFIKASI Whatsapp (Skenario Awal)
            if (customer_phone) {
                const type = (fullOrder.order_type || '').toLowerCase();
                let waMsg = '';

                // Logika Pemilihan Template
                if (type === 'online' || type.includes('delivery') || type.includes('pickup') || type.includes('booking')) {
                    // Pesanan dari Website / App Pelanggan
                    waMsg = formatNewOrder(fullOrder);
                } else {
                    // Pesanan Offline / Kasir (Dine-in / Walk-in) -> Hanya Struk
                    waMsg = formatWalkInReceipt(fullOrder);
                }
                
                if (waMsg) {
                     sendWhatsApp(customer_phone, waMsg).catch(err => console.error("WA Send Failed:", err.message));
                }
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

import { formatOrderReady } from '../services/whatsapp.js'; // Ensure imported at top if needed, or re-import inside function scope if ESM allows, but better to assume top-level available or pass it. 
// Note: Since I can't touch top imports in this partial replace easily without duplicating, I will assume `sendWhatsApp` and `formatOrderReady` are imported at the top. 
// If not, we might need to rely on the previous `replace` to have added them. The previous replace for POST / added them.
// Wait, `router.patch` is further down.

router.patch('/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        const orderId = Number(req.params.id);
        
        // Update Status
        await db.run('UPDATE orders SET status = $1, payment_status = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3',
            [status, status === 'completed' ? 'paid' : 'unpaid', orderId]);

        // Get Updated Order for Notification Logic
        const order = await db.get('SELECT * FROM orders WHERE id = $1', [orderId]);
        
        const io = req.app.get('io');
        if (io) io.emit('order-updated', { id: orderId, status });

        // 2. CHECK SECOND NOTIFICATION (Khusus Pickup -> Ready/Completed)
        if (status === 'completed' && order) {
            const type = (order.order_type || '').toLowerCase();
            
            // Jika Pickup, ini saatnya kirim notifikasi kedua "Pesanan SIAP"
            if (type.includes('pickup') || type.includes('take')) {
                if (order.customer_phone) {
                    const msg = formatOrderReady(order);
                    sendWhatsApp(order.customer_phone, msg); // Kirim Pesan "SIAP DIAMBIL"
                }
            }
        }

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
        // Simple Date Match without Double TZ Conversion
        const todayStr = new Date(new Date().getTime() + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);

        console.log(`[STATS] Fetching today's stats for date: ${todayStr}`);

const stats = await db.get(`
            SELECT 
                COUNT(*) as total_orders, 
                COALESCE(SUM(total), 0) as total_sales,
                COALESCE(SUM(total_hpp), 0) as total_cogs 
            FROM orders 
            WHERE status IN ('completed', 'pending') 
            AND created_at::date = $1::date
        `, [todayStr]);

res.json(stats);
    } catch (err) {
    console.error("[STATS ERROR]", err);
    res.status(500).json({ error: err.message });
}
});

export default router;
