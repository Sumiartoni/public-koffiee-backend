import express from 'express';
import db from '../db.js';
import { sendWhatsApp, formatNewOrder, formatOrderReady, formatWalkInReceipt, formatPaymentSuccess } from '../services/whatsapp.js';
import { processQrisPayment } from '../services/payment/index.js';

const router = express.Router();

// ============================================
// SECURITY: Validation Utilities
// ============================================

/**
 * Validate customer name - prevent spaces-only, too short, or suspicious patterns
 */
function validateCustomerName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Nama customer harus diisi' };
    }

    const trimmed = name.trim();

    // Check if only spaces or empty
    if (trimmed.length === 0) {
        return { valid: false, error: 'Nama tidak boleh hanya spasi' };
    }

    // Minimum 3 characters
    if (trimmed.length < 3) {
        return { valid: false, error: 'Nama minimal 3 karakter' };
    }

    // Check if only numbers
    if (/^\d+$/.test(trimmed)) {
        return { valid: false, error: 'Nama tidak boleh hanya angka' };
    }

    // Check for suspicious repeated characters (e.g., "aaaa", "1111")
    if (/(.)\1{4,}/.test(trimmed)) {
        return { valid: false, error: 'Nama tidak valid' };
    }

    return { valid: true, value: trimmed };
}

/**
 * Validate Indonesian phone number
 */
function validatePhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') {
        return { valid: false, error: 'Nomor WhatsApp harus diisi' };
    }

    const trimmed = phone.trim();

    // Check if only spaces
    if (trimmed.length === 0) {
        return { valid: false, error: 'Nomor WhatsApp tidak boleh hanya spasi' };
    }

    // Remove all non-digits
    const digitsOnly = trimmed.replace(/\D/g, '');

    // Check minimum length (Indonesian: 10-13 digits)
    if (digitsOnly.length < 10) {
        return { valid: false, error: 'Nomor WhatsApp terlalu pendek (minimal 10 digit)' };
    }

    if (digitsOnly.length > 13) {
        return { valid: false, error: 'Nomor WhatsApp terlalu panjang (maksimal 13 digit)' };
    }

    // Must start with 08, 628, or +628
    const validPrefixes = ['08', '628', '+628'];
    const hasValidPrefix = validPrefixes.some(prefix => trimmed.startsWith(prefix));

    if (!hasValidPrefix) {
        return { valid: false, error: 'Nomor WhatsApp harus dimulai dengan 08 atau 628' };
    }

    return { valid: true, value: digitsOnly };
}

/**
 * Validate address for delivery orders
 */
function validateAddress(address, orderType) {
    // Only validate for delivery orders
    if (orderType !== 'delivery') {
        return { valid: true, value: address || '' };
    }

    if (!address || typeof address !== 'string') {
        return { valid: false, error: 'Alamat pengiriman harus diisi' };
    }

    const trimmed = address.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: 'Alamat tidak boleh hanya spasi' };
    }

    // Minimum 10 characters for delivery address
    if (trimmed.length < 10) {
        return { valid: false, error: 'Alamat terlalu pendek (minimal 10 karakter)' };
    }

    return { valid: true, value: trimmed };
}

/**
 * Detect suspicious order patterns
 */
function detectSuspiciousPatterns(name, phone, address) {
    const flags = [];

    // Name same as phone number
    if (name.replace(/\D/g, '') === phone.replace(/\D/g, '')) {
        flags.push('name_same_as_phone');
    }

    // Very short address for delivery
    if (address && address.length < 15) {
        flags.push('short_address');
    }

    // Excessive special characters
    if (/[!@#$%^&*()]{3,}/.test(name)) {
        flags.push('excessive_special_chars');
    }

    return flags;
}

// ============================================
// SECURITY: Rate Limiting
// ============================================

// Simple in-memory rate limiter (for production, use Redis)
const orderRateLimiter = {
    requests: new Map(), // IP -> [{timestamp, count}]

    // Configuration
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 3, // Max 3 orders per window

    check(ip) {
        const now = Date.now();

        // Get existing requests for this IP
        if (!this.requests.has(ip)) {
            this.requests.set(ip, []);
        }

        const ipRequests = this.requests.get(ip);

        // Remove old requests outside the time window
        const validRequests = ipRequests.filter(req => (now - req) < this.windowMs);
        this.requests.set(ip, validRequests);

        // Check if limit exceeded
        if (validRequests.length >= this.maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetIn: Math.ceil((validRequests[0] + this.windowMs - now) / 1000) // seconds
            };
        }

        // Add current request
        validRequests.push(now);
        this.requests.set(ip, validRequests);

        return {
            allowed: true,
            remaining: this.maxRequests - validRequests.length
        };
    },

    // Clean up old entries periodically
    cleanup() {
        const now = Date.now();
        for (const [ip, requests] of this.requests.entries()) {
            const validRequests = requests.filter(req => (now - req) < this.windowMs);
            if (validRequests.length === 0) {
                this.requests.delete(ip);
            } else {
                this.requests.set(ip, validRequests);
            }
        }
    }
};

// Cleanup rate limiter every 5 minutes
setInterval(() => orderRateLimiter.cleanup(), 5 * 60 * 1000);

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

// POST: CREATE NEW ORDER
router.post('/', async (req, res) => {
    const { customer_name, items, payment_method, order_type, table_number, notes, discount, address, customer_phone } = req.body;

    console.log(`\n--- NEW ORDER ATTEMPT ---`);
    console.log(`Cust: ${customer_name}, Type: ${order_type}, Items: ${items?.length}`);

    // ============================================
    // SECURITY: Rate Limiting Check
    // ============================================
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const rateLimitResult = orderRateLimiter.check(clientIp);

    if (!rateLimitResult.allowed) {
        console.warn(`[RATE LIMIT] Order blocked from IP: ${clientIp}`);
        return res.status(429).json({
            error: 'Terlalu banyak pesanan dalam waktu singkat',
            detail: `Silakan tunggu ${Math.ceil(rateLimitResult.resetIn / 60)} menit sebelum memesan lagi`,
            resetIn: rateLimitResult.resetIn
        });
    }

    console.log(`[RATE LIMIT] IP: ${clientIp}, Remaining: ${rateLimitResult.remaining}`);

    // ============================================
    // SECURITY: Input Validation
    // ============================================

    // Validate customer name
    const nameValidation = validateCustomerName(customer_name);
    if (!nameValidation.valid) {
        console.warn(`[VALIDATION] Name rejected: "${customer_name}"`);
        return res.status(400).json({ error: nameValidation.error });
    }

    // Validate phone number
    const phoneValidation = validatePhoneNumber(customer_phone);
    if (!phoneValidation.valid) {
        console.warn(`[VALIDATION] Phone rejected: "${customer_phone}"`);
        return res.status(400).json({ error: phoneValidation.error });
    }

    // Validate address (if delivery)
    const addressValidation = validateAddress(address, order_type);
    if (!addressValidation.valid) {
        console.warn(`[VALIDATION] Address rejected for ${order_type}: "${address}"`);
        return res.status(400).json({ error: addressValidation.error });
    }

    // Detect suspicious patterns
    const suspiciousFlags = detectSuspiciousPatterns(
        nameValidation.value,
        phoneValidation.value,
        addressValidation.value
    );

    if (suspiciousFlags.length > 0) {
        console.warn(`[SUSPICIOUS ORDER] Flags: ${suspiciousFlags.join(', ')} | Name: ${customer_name} | Phone: ${customer_phone}`);
        // Continue but mark as suspicious for admin review
    }

    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Keranjang kosong' });
    }

    try {
        const orderNumber = await generateOrderNumber();
        let subtotal = 0;
        let totalHpp = 0;
        const validItems = [];

        // Validate Items & Stock
        for (const item of items) {
            // Use price from Flutter (already includes extras if selected)
            let price = Number(item.price) || 0;
            let subtotalFromClient = Number(item.subtotal) || 0;
            let hpp = 0;
            let menuItemId = Number(item.menu_item_id);
            let menuItemName = item.name || item.menu_item_name || 'Item Hapus';

            // Try to lookup from DB for stock deduction and HPP
            const menuItem = await db.get('SELECT * FROM menu_items WHERE id = $1', [menuItemId]);
            if (menuItem) {
                hpp = Number(menuItem.hpp);
                menuItemName = menuItem.name;

                // ONLY use DB price if client didn't send one (fallback)
                if (!item.price || Number(item.price) === 0) {
                    price = Number(menuItem.price);
                }

                // Deduct Stock
                try {
                    const recipes = await db.all('SELECT * FROM recipes WHERE menu_item_id = $1', [menuItem.id]);
                    for (const recipe of recipes) {
                        const deductQty = Number(recipe.quantity) * (Number(item.quantity) || 1);
                        await db.run('UPDATE ingredients SET stock_qty = stock_qty - $1 WHERE id = $2', [deductQty, recipe.ingredient_id]);
                    }
                } catch (stockErr) {
                    console.error("[STOCK UPDATE ERROR]", stockErr.message);
                }
            } else {
                console.warn(`[ORDER WARNING] Item ${menuItemId} not found. Using frontend price: ${price}`);
            }

            const qty = Number(item.quantity) || 1;

            // Use subtotal from client if available (already calculated with extras in Flutter)
            // Otherwise calculate from price * qty
            const itemSubtotal = subtotalFromClient || (price * qty);
            const itemHpp = hpp * qty;

            subtotal += itemSubtotal;
            totalHpp += itemHpp;

            validItems.push({
                menu_item_id: menuItemId,
                name: menuItemName,
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

        // LOGIC STATUS:
        // Default: 'unpaid' (Safety default)
        let finalStatus = 'unpaid';
        let finalPaymentStatus = 'unpaid';

        const typeLower = String(order_type || 'online').toLowerCase();
        const methodLower = String(payment_method || 'cash').toLowerCase();

        // Daftar tipe yang dianggap Online/Web
        const onlineTypes = ['online', 'booking', 'delivery', 'pickup'];

        if (onlineTypes.includes(typeLower)) {
            if (methodLower === 'qris') {
                finalStatus = 'unpaid';
                finalPaymentStatus = 'unpaid';
            } else {
                // Tipe Online tapi bayar CASH (COD/Pickup) -> Langsung PENDING agar Kasir tau
                finalStatus = 'pending';
                finalPaymentStatus = 'unpaid';
            }
        } else {
            // Jika dikirim dari POS (Walk-in), bisa jadi statusnya 'completed' atau 'pending'
            finalStatus = req.body.status || 'pending';
            finalPaymentStatus = req.body.payment_status || 'unpaid';
        }

        console.log(`[ORDER LOGIC] Type: ${typeLower}, Method: ${methodLower} -> Status: ${finalStatus}`);

        console.log(`Calculated Total: ${total}`);

        // Insert Order
        const insertSql = `
            INSERT INTO orders (
                order_number, customer_name, customer_phone, customer_address, 
                order_type, table_number, payment_method, payment_status, status, 
                subtotal, tax, discount, total, total_hpp, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id
        `;

        const result = await db.run(insertSql, [
            orderNumber,
            nameValidation.value, // Use validated/trimmed name
            phoneValidation.value, // Use validated/cleaned phone
            addressValidation.value, // Use validated/trimmed address
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
        ]);

        const orderId = (result.rows && result.rows[0]) ? result.rows[0].id : null;
        if (!orderId) throw new Error("Database failed to return Order ID");

        // Insert Order Items
        for (const item of validItems) {
            const extrasStr = (typeof item.extras === 'string') ? item.extras : JSON.stringify(item.extras || null);
            await db.run(`
                INSERT INTO order_items (order_id, menu_item_id, menu_item_name, quantity, price, hpp, subtotal, notes, extras)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [orderId, item.menu_item_id, item.name, item.quantity, item.price, item.hpp, item.subtotal, item.notes, extrasStr]);
        }

        // Fetch Complete Order (for Socket & WA)
        const fullOrder = await db.get('SELECT * FROM orders WHERE id = $1', [orderId]);
        fullOrder.items = validItems;

        // Broadcast Socket (Hanya jika status bukan 'unpaid')
        // User Request: Notifikasi masuk ke POS hanya saat status 'pending' (setelah bayar)
        const io = req.app.get('io');
        if (io && fullOrder.status !== 'unpaid') {
            io.emit('new-order', fullOrder);
        }

        // QRIS PROCESSING (NEW)
        let paymentData = null;
        if (payment_method === 'qris' || (fullOrder.payment_method === 'qris')) {
            try {
                console.log(`[QRIS] Generating dynamic QRIS for Order ${orderId}`);
                paymentData = await processQrisPayment(orderId);
                // paymentData contains: { qris_string, qris_image, final_amount, unique_code, expires_at }
            } catch (qrisErr) {
                console.error("[QRIS ERROR]", qrisErr.message);
                // Don't fail the order, just return error in payload? Or maybe user should know.
                // We'll proceed but paymentData will be null.
            }
        }

        // Send WhatsApp Notification (Send for ALL orders, including UNPAID QRIS)
        if (customer_phone) {
            const typeLower = (order_type || '').toLowerCase();
            let waMsg = '';

            // Jika Online/Delivery/Pickup -> Pakai format detail konfirmasi
            if (typeLower === 'online' || typeLower.includes('delivery') || typeLower.includes('pickup') || typeLower.includes('booking')) {
                waMsg = formatNewOrder(fullOrder);
            } else {
                // Jika dari Kasir / Walk-in / Pos -> Hanya Struk
                waMsg = formatWalkInReceipt(fullOrder);
            }

            if (waMsg) {
                sendWhatsApp(customer_phone, waMsg).catch(err => console.error("WA Failed:", err.message));
            }
        }

        res.status(201).json({
            message: 'Order created',
            id: orderId,
            order_number: orderNumber,
            order: fullOrder,
            payment: paymentData // Include QRIS Data here
        });

    } catch (err) {
        console.error("ORDER CREATE ERROR:", err);
        res.status(500).json({ error: 'System Error', detail: err.message });
    }
});

// GET Orders
router.get('/', async (req, res) => {
    try {
        const orders = await db.all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100');
        for (let o of orders) {
            o.items = await db.all('SELECT * FROM order_items WHERE order_id = $1', [Number(o.id)]);
        }
        res.json({ orders });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET Pending Orders
router.get('/pending', async (req, res) => {
    try {
        const orders = await db.all("SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC");
        for (let o of orders) {
            o.items = await db.all('SELECT * FROM order_items WHERE order_id = $1', [Number(o.id)]);
        }
        res.json({ orders });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH Status (Confirm Order / Complete)
router.patch('/:id/status', async (req, res) => {
    const { status } = req.body; // usually 'completed' or 'cancelled'
    const orderId = Number(req.params.id);

    try {
        await db.run('UPDATE orders SET status = $1, payment_status = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3',
            [status, status === 'completed' ? 'paid' : 'unpaid', orderId]);

        const order = await db.get('SELECT * FROM orders WHERE id = $1', [orderId]);

        const io = req.app.get('io');
        if (io) io.emit('order-updated', { id: orderId, status });

        // NOTIFIKASI KEDUA (Setelah Bayar / Completed)
        if (status === 'completed' && order) {
            const type = (order.order_type || '').toLowerCase();
            const method = (order.payment_method || '').toLowerCase();

            if (method === 'qris') {
                // Khusus QRIS -> Notifikasi Pembayaran Sukses
                if (order.customer_phone) {
                    const msg = formatPaymentSuccess(order);
                    await sendWhatsApp(order.customer_phone, msg); // Await to ensure sending
                }
            } else if (type.includes('pickup') || type.includes('take')) {
                // Khusus Pickup -> Notifikasi Siap Diambil
                if (order.customer_phone) {
                    const msg = formatOrderReady(order);
                    sendWhatsApp(order.customer_phone, msg);
                }
            } else if (order.customer_phone) {
                // Untuk Walk-in / Dine-in / Delivery Cash -> Kirim Struk Lunas
                const msg = formatWalkInReceipt(order);
                sendWhatsApp(order.customer_phone, msg);
            }
        }

        res.json({ message: 'Status updated', order });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE (Void Order)
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

// STATS TODAY (Dashboard)
// PENTING: Hanya menghitung status 'completed'. 'pending' TIDAK DIHITUNG agar laporan akurat.
router.get('/stats/today', async (req, res) => {
    try {
        const todayStr = new Date(new Date().getTime() + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);

        const timezone = 'Asia/Jakarta';

        // Basic Stats
        const basicStats = await db.get(`
            SELECT 
                COUNT(id) as total_orders, 
                COALESCE(SUM(total), 0) as total_revenue,
                COALESCE(SUM(total_hpp), 0) as total_cogs 
            FROM orders 
            WHERE status = 'completed' 
            AND (created_at AT TIME ZONE $2)::date = $1::date
        `, [todayStr, timezone]);

        // Payment Breakdown
        const paymentStats = await db.all(`
            SELECT payment_method, COUNT(id) as count, COALESCE(SUM(total), 0) as total_amount
            FROM orders 
            WHERE status = 'completed' 
            AND (created_at AT TIME ZONE $2)::date = $1::date
            GROUP BY payment_method
        `, [todayStr, timezone]);

        // Order Type Breakdown
        const typeStats = await db.all(`
            SELECT order_type, COUNT(id) as count, COALESCE(SUM(total), 0) as total_amount
            FROM orders 
            WHERE status = 'completed' 
            AND (created_at AT TIME ZONE $2)::date = $1::date
            GROUP BY order_type
        `, [todayStr, timezone]);

        // Top Selling Items
        const topItems = await db.all(`
            SELECT 
                oi.menu_item_name as item_name, 
                SUM(oi.quantity) as total_qty, 
                SUM(oi.subtotal) as total_revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.status = 'completed' 
            AND (o.created_at AT TIME ZONE $2)::date = $1::date
            GROUP BY oi.menu_item_name
            ORDER BY total_qty DESC
            LIMIT 5
        `, [todayStr, timezone]);

        res.json({
            total_orders: parseInt(basicStats.total_orders || 0),
            total_sales: parseFloat(basicStats.total_revenue || 0),
            total_cogs: parseFloat(basicStats.total_cogs || 0),
            payment_breakdown: paymentStats.map(s => ({
                payment_method: s.payment_method,
                count: parseInt(s.count),
                total: parseFloat(s.total_amount)
            })),
            type_breakdown: typeStats.map(s => ({
                order_type: s.order_type,
                count: parseInt(s.count),
                total: parseFloat(s.total_amount)
            })),
            top_items: topItems.map(s => ({
                name: s.item_name,
                qty: parseInt(s.total_qty),
                total: parseFloat(s.total_revenue)
            }))
        });
    } catch (err) {
        console.error("[STATS ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
