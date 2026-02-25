import express from 'express';
import db from '../db.js';
import { broadcastPush } from '../services/firebase.js';

const router = express.Router();

// =============================================
// ADMIN: Manage Notifications
// =============================================

// GET all sent notifications (Admin)
router.get('/admin', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT n.*, cv.title as voucher_title 
            FROM notifications n
            LEFT JOIN customer_vouchers cv ON n.voucher_id = cv.id
            ORDER BY n.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST: Send new notification (Admin)
router.post('/', async (req, res) => {
    const { title, message, voucher_id, is_global } = req.body;

    if (!title || !message) {
        return res.status(400).json({ error: 'Judul dan Pesan wajib diisi' });
    }

    try {
        // 1. Create Notification Record
        const result = await db.query(
            `INSERT INTO notifications (title, message, voucher_id, is_global) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [title, message, voucher_id || null, is_global !== false] // Default true
        );
        const notification = result.rows[0];

        // 2. Broadcast to users
        // Future optimization: Use background job or batch insert for thousands of users
        // For now, fetching all IDs and inserting is sufficient for < 10k users
        const users = await db.query('SELECT id FROM users');

        if (users.rows.length > 0) {
            const values = users.rows.map(u => `(${u.id}, ${notification.id})`).join(',');
            await db.query(`
                INSERT INTO user_notifications (user_id, notification_id) 
                VALUES ${values}
            `);
        }

        // PUSH NOTIFICATION: Broadcast to all tokens
        broadcastPush(title, message, {
            notification_id: notification.id.toString(),
            type: 'announcement'
        });

        res.status(201).json({ message: 'Notifikasi berhasil dikirim', notification, recipient_count: users.rows.length });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE notification (Admin)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM notifications WHERE id = $1', [id]);
        res.json({ message: 'Notifikasi dihapus' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// USER: Inbox & Actions
// =============================================

// GET User Inbox
router.get('/', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    try {
        const result = await db.query(`
            SELECT un.*, n.title, n.message, n.voucher_id, n.created_at as sent_at,
                   cv.title as voucher_title, cv.validity_days
            FROM user_notifications un
            JOIN notifications n ON un.notification_id = n.id
            LEFT JOIN customer_vouchers cv ON n.voucher_id = cv.id
            WHERE un.user_id = $1
            ORDER BY un.created_at DESC
        `, [user_id]);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PATCH: Mark as Read
router.patch('/:id/read', async (req, res) => {
    const { id } = req.params; // user_notification_id
    try {
        await db.query('UPDATE user_notifications SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST: Claim Voucher from Inbox
router.post('/claim-voucher', async (req, res) => {
    const { user_notification_id } = req.body;

    if (!user_notification_id) return res.status(400).json({ error: 'ID Notifikasi wajib diisi' });

    try {
        // 1. Get User Notification & Notification details
        const notifInfo = await db.query(`
            SELECT un.*, n.voucher_id 
            FROM user_notifications un
            JOIN notifications n ON un.notification_id = n.id
            WHERE un.id = $1
        `, [user_notification_id]);

        const userNotif = notifInfo.rows[0];
        if (!userNotif) return res.status(404).json({ error: 'Notifikasi tidak ditemukan' });

        if (userNotif.is_claimed) return res.status(400).json({ error: 'Voucher sudah diklaim dari pesan ini' });
        if (!userNotif.voucher_id) return res.status(400).json({ error: 'Pesan ini tidak memiliki voucher' });

        // 2. Check Voucher Validity & Quota
        const voucher = (await db.query('SELECT * FROM customer_vouchers WHERE id = $1', [userNotif.voucher_id])).rows[0];
        if (!voucher) return res.status(404).json({ error: 'Voucher tidak ditemukan' });
        if (!voucher.is_active) return res.status(400).json({ error: 'Voucher tidak aktif' });
        if (voucher.quota !== null && voucher.quota <= 0) return res.status(400).json({ error: 'Kuota voucher habis' });

        // 3. Calculate Expired At
        let expired_at = null;
        if (voucher.validity_days) {
            const date = new Date();
            date.setDate(date.getDate() + voucher.validity_days);
            expired_at = date.toISOString();
        }

        // 4. Execute Claim (Transaction-like)
        // A. Insert to user_vouchers
        await db.query(
            `INSERT INTO user_vouchers (user_id, voucher_id, expired_at) VALUES ($1, $2, $3)`,
            [userNotif.user_id, userNotif.voucher_id, expired_at]
        );

        // B. Update user_notification status
        await db.query('UPDATE user_notifications SET is_claimed = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [user_notification_id]);

        // C. Decrement Quota
        if (voucher.quota !== null) {
            await db.query('UPDATE customer_vouchers SET quota = quota - 1 WHERE id = $1', [voucher.id]);
        }

        res.json({ success: true, message: 'Voucher berhasil diklaim', expired_at });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
