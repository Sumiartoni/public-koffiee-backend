import express from 'express';
import db from '../db.js';
import { sendWhatsApp, formatOrderReceipt, formatDeliveryNotification, formatPickupNotification, formatOrderReady } from '../services/whatsapp.js';
import { processQrisPayment } from '../services/payment/index.js';

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
    const { customer_name, items, payment_method, order_type, table_number, notes, discount, address, customer_phone, is_pay_later } = req.body;

    console.log(`\n--- NEW ORDER ATTEMPT ---`);
    console.log(`Cust: ${customer_name}, Type: ${order_type}, PayLater: ${is_pay_later}, Items: ${items?.length}`);

    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Keranjang kosong' });
    }

    try {
        const orderNumber = await generateOrderNumber();
        console.log(`Generated No: ${orderNumber}`);

        let subtotal = 0;
        let totalHpp = 0;
        const validItems = [];

        for (const item of items) {
            const menuItem = await db.get('SELECT * FROM menu_items WHERE id = $1', [Number(item.menu_item_id)]);
            if (menuItem) {
                const price = (item.price !== undefined) ? Number(item.price) : Number(menuItem.price);
                const qty = Number(item.quantity) || 1;
                const itemSubtotal = price * qty;
                const itemHpp = (Number(menuItem.hpp) || 0) * qty;

                subtotal += itemSubtotal;
                totalHpp += itemHpp;

                validItems.push({
                    menu_item_id: menuItem.id,
                    name: menuItem.name || menuItem.menu_item_name, // Fallback if name missing
                    quantity: qty,
                    price: price,
                    hpp: Number(menuItem.hpp) || 0,
                    subtotal: itemSubtotal,
                    notes: item.notes || '',
                    extras: item.extras || null
                });

                // Stock update (Background attempt)
                try {
                    const recipes = await db.all('SELECT * FROM recipes WHERE menu_item_id = $1', [menuItem.id]);
                    for (const recipe of recipes) {
                        const deductQty = Number(recipe.quantity) * qty;
                        await db.run('UPDATE ingredients SET stock_qty = stock_qty - $1 WHERE id = $2', [deductQty, recipe.ingredient_id]);
                    }
                } catch (stockErr) {
                    console.error("[STOCK UPDATE ERROR] Ignored to let order pass:", stockErr.message);
                }
            }
        }

        const tax = 0;
        const total = subtotal - (Number(discount) || 0);

        // LOGIC PAYMENT STATUS
        let finalStatus = 'pending';
        let finalPaymentStatus = 'pending';

        if (order_type === 'online' || order_type === 'delivery' || order_type === 'pickup') {
            finalStatus = 'pending';
            finalPaymentStatus = 'unpaid';
        } else {
            // Dine-in / Takeaway (POS)
            if (is_pay_later) {
                finalStatus = 'pending'; // Tetap pending sampai dibayar
                finalPaymentStatus = 'unpaid';
            } else {
                finalStatus = 'completed';
                finalPaymentStatus = 'paid';
            }
        }

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
            String(order_type || 'dine-in'),
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

        // RE-FETCH FULL ORDER FOR RESPONSE & WA
        const fullOrder = await db.get('SELECT * FROM orders WHERE id = $1', [orderId]);
        fullOrder.items = await db.all('SELECT * FROM order_items WHERE order_id = $1', [orderId]);

        const io = req.app.get('io');
        if (io) {
            console.log(`Broadcasting new-order via Socket.IO`);
            io.emit('new-order', fullOrder);
        }

        // --- WHATSAPP NOTIFICATION TRIGGER ---
        // Default Payment Data
        let paymentData = null;
        let qrImageUrl = null; // Changed from qrImage (base64) to URL

        // Jika QRIS, Generate Dynamic QRIS via Payment Service
        if (payment_method === 'qris') {
            try {
                paymentData = await processQrisPayment(orderId);
                // qrImage = paymentData.qris_image; // Base64 (Legacy/Frontend display)

                // Construct Public URL for WhatsApp (Fonnte prefers URL over Base64)
                // Gunakan host dinamis atau hardcoded domain production
                const baseUrl = process.env.API_BASE_URL || 'https://illegal-jacinta-mkrrn-d8f0167d.koyeb.app';
                qrImageUrl = `${baseUrl}/api/payment/render?data=${encodeURIComponent(paymentData.qris_string)}`;

                console.log(`[PAYMENT] QRIS Generated. UniqueCode: ${paymentData.unique_code}, Final: ${paymentData.final_amount}`);
            } catch (err) {
                console.error("[PAYMENT ERROR] Gagal generate QRIS:", err);
            }
        }

        // Teruskan logika WA
        // ... (Update variabel qrImage -> qrImageUrl dibawah)

        // Teruskan logika WA

        if (customer_phone) {
            const isOnline = (order_type === 'online' || order_type === 'delivery' || order_type === 'pickup');

            if (isOnline) {
                // Notifikasi Order Masuk (Delivery / Pickup)
                const isDelivery = (order_type === 'delivery') || (address && address.length > 5 && !String(address).toUpperCase().includes('PICKUP'));

                if (isDelivery) {
                    const msg = formatDeliveryNotification(fullOrder, fullOrder.items);
                    sendWhatsApp(customer_phone, msg, qrImageUrl);
                } else {
                    const msg = formatPickupNotification(fullOrder, fullOrder.items);
                    sendWhatsApp(customer_phone, msg, qrImageUrl);
                }
            } else {
                // POS / Dine-in / Pay Later
                const msg = formatOrderReceipt(fullOrder, fullOrder.items);
                // Jika metode pembayaran QRIS, kirim juga gambarnya
                sendWhatsApp(customer_phone, msg, qrImageUrl);
            }
        }
        // -------------------------------------

        res.status(201).json({
            message: 'Order successful',
            order_number: orderNumber,
            id: orderId,
            order: fullOrder,
            payment: paymentData, // Data lengkap (string, image, expiry)
            qris: paymentData?.qris_image // Backward compatibility for frontend (Base64)
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
        const orderId = Number(req.params.id);

        // Update Status Logic
        let updateSql = 'UPDATE orders SET status = $1';
        let params = [status];

        // Jika selesai, tandai paid juga
        if (status === 'completed') {
            updateSql += ', payment_status = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3';
            params.push('paid', orderId);
        } else {
            updateSql += ' WHERE id = $2';
            params.push(orderId);
        }

        await db.run(updateSql, params);

        const io = req.app.get('io');
        if (io) io.emit('order-updated', { id: orderId, status });

        // --- WHATSAPP TRIGGER ON COMPLETE ---
        if (status === 'completed') {
            const order = await db.get('SELECT * FROM orders WHERE id = $1', [orderId]);
            if (order && order.customer_phone) {

                // LOGIC REVISI: Strict Check
                // 1. Cek explicit order_type (jika ada kolom ini dan isinya 'delivery')
                // 2. Atau cek implicit via online + address

                const isExplicitDelivery = (order.order_type === 'delivery'); // Paling akurat jika frontend kirim ini
                const isImplicitDelivery = (order.order_type === 'online' && order.customer_address && order.customer_address.length > 5 && !order.customer_address.toUpperCase().includes('PICKUP'));

                const isDelivery = isExplicitDelivery || isImplicitDelivery;

                if (isDelivery) {
                    console.log(`[WA] SIKIP KIRIM PESAN SELESAI untuk Order Delivery #${order.order_number}`);
                } else {
                    // Kasus: PICKUP (Online) atau DINE-IN/TAKEAWAY (POS)
                    // HANYA KIRIM JIKA BUKAN DELIVERY

                    if (order.order_type === 'online' || order.order_type === 'pickup') {
                        // Online Pickup -> Notif "Siap Diambil"
                        const msg = formatOrderReady(order);
                        await sendWhatsApp(order.customer_phone, msg);
                    } else {
                        // POS Offline -> Kirim Struk
                        order.items = await db.all('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
                        const msg = formatOrderReceipt(order, order.items);
                        await sendWhatsApp(order.customer_phone, msg);
                    }
                }
            }
        }
        // ------------------------------------

        res.json({ message: 'Status updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pending', async (req, res) => {
    try {
        // Ambil pending DAN unpaid (untuk pay later)
        const orders = await db.all("SELECT * FROM orders WHERE status = 'pending' OR payment_status = 'unpaid' ORDER BY created_at DESC");
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
        // Get today's date
        const now = new Date();
        const jktTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        const todayStr = jktTime.toISOString().slice(0, 10);

        console.log(`[STATS] Fetching today's stats for date: ${todayStr}`);

        let sql;
        if (db.type === 'sqlite') {
            // SQLite Syntax
            sql = `
                SELECT 
                    COUNT(*) as total_orders, 
                    COALESCE(SUM(total), 0) as total_sales,
                    COALESCE(SUM(total_hpp), 0) as total_cogs 
                FROM orders 
                WHERE status = 'completed' 
                AND date(created_at) = $1
            `;
        } else {
            // Postgres Syntax (Supabase)
            sql = `
                SELECT 
                    COUNT(*) as total_orders, 
                    COALESCE(SUM(total), 0) as total_sales,
                    COALESCE(SUM(total_hpp), 0) as total_cogs 
                FROM orders 
                WHERE status = 'completed' 
                AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date = $1::date
            `;
        }

        const stats = await db.get(sql, [todayStr]);
        res.json(stats);
    } catch (err) {
        console.error("[STATS ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
