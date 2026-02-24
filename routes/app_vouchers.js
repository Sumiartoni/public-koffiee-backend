import express from 'express';
import db from '../db.js';

const router = express.Router();

// 1. GET /user/vouchers (Device Based or User Based)
router.get('/', async (req, res) => {
    const { user_id, device_id } = req.query;

    try {
        let query = `
      SELECT uv.*, cv.title, cv.description, cv.category, cv.type, cv.value, cv.min_purchase, cv.max_discount, cv.validity_days
      FROM user_vouchers uv
      JOIN customer_vouchers cv ON uv.voucher_id = cv.id
      WHERE uv.is_used = FALSE
    `;
        const params = [];

        if (user_id && device_id) {
            // Both provided: show vouchers from either source
            query += ` AND (uv.user_id = $1 OR uv.device_id = $2)`;
            params.push(user_id, device_id);
        } else if (user_id) {
            query += ` AND uv.user_id = $1`;
            params.push(user_id);
        } else if (device_id) {
            query += ` AND uv.device_id = $1`;
            params.push(device_id);
        } else {
            return res.status(400).json({ error: 'User ID or Device ID required' });
        }

        // Filter expired vouchers in query? 
        // User said: "Voucher berlaku selama beberapa hari... tidak bertambah kembali walaupun voucher kadaluarsa."
        // Usually we want to show expired vouchers as "Expired" or hide them.
        // For now, let's just return them, frontend can decide to hide or show "Expired".
        // But better to at least sort them?
        // Let's filter out expired ones for the "active vouchers" list if that's what this endpoint is for.
        // query += ` AND (uv.expired_at IS NULL OR uv.expired_at > CURRENT_TIMESTAMP)`; 
        // But user might want to see what they have, even if expired. 
        // I will return all unused, frontend handles display.

        const result = await db.query(query, params);

        // Add status to response
        const now = new Date();
        const vouchers = result.rows.map(v => ({
            ...v,
            is_expired: v.expired_at ? new Date(v.expired_at) < now : false
        }));

        res.json(vouchers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. POST /voucher/claim (General Vouchers)
router.post('/claim', async (req, res) => {
    const { voucher_id, user_id, device_id } = req.body;

    if (!user_id && !device_id) return res.status(400).json({ error: 'User ID or Device ID required' });

    try {
        // Check voucher validity & quota
        const voucher = (await db.query('SELECT * FROM customer_vouchers WHERE id = $1 AND is_active = TRUE', [voucher_id])).rows[0];
        if (!voucher) return res.status(404).json({ error: 'Voucher tidak ditemukan atau tidak aktif' });

        // Check quota (remaining stock)
        if (voucher.quota !== null && voucher.quota <= 0) {
            return res.status(400).json({ error: 'Kuota voucher habis' });
        }

        // Check if already claimed
        let existingClaim;
        if (user_id) {
            existingClaim = (await db.query('SELECT * FROM user_vouchers WHERE voucher_id = $1 AND user_id = $2', [voucher_id, user_id])).rows[0];
        } else if (device_id) {
            existingClaim = (await db.query('SELECT * FROM user_vouchers WHERE voucher_id = $1 AND device_id = $2', [voucher_id, device_id])).rows[0];
        }

        if (existingClaim) return res.status(400).json({ error: 'Voucher sudah diklaim' });

        // Calculate expired_at
        let expired_at = null;
        if (voucher.validity_days) {
            const date = new Date();
            date.setDate(date.getDate() + voucher.validity_days);
            expired_at = date.toISOString();
        }

        // Insert Claim
        await db.query(
            `INSERT INTO user_vouchers (user_id, voucher_id, device_id, expired_at) VALUES ($1, $2, $3, $4)`,
            [user_id || null, voucher_id, device_id || null, expired_at]
        );

        // Deduct Quota
        if (voucher.quota !== null) {
            await db.query('UPDATE customer_vouchers SET quota = quota - 1 WHERE id = $1', [voucher_id]);
        }

        res.json({ success: true, message: 'Voucher berhasil diklaim', expired_at });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. GET /user/referral
router.get('/referral', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    try {
        const user = (await db.query('SELECT referral_code FROM users WHERE id = $1', [user_id])).rows[0];
        const referrals = (await db.query('SELECT COUNT(*) as total FROM users WHERE referred_by = (SELECT referral_code FROM users WHERE id = $1)', [user_id])).rows[0];

        res.json({
            referral_code: user?.referral_code || 'Belum Ada Code',
            total_referrals: parseInt(referrals.total)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
