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

        if (user_id) {
            query += ` AND uv.user_id = $1`;
            params.push(user_id);
        } else if (device_id) {
            query += ` AND uv.device_id = $1`;
            params.push(device_id);
        } else {
            return res.status(400).json({ error: 'User ID or Device ID required' });
        }

        const result = await db.query(query, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. POST /voucher/claim (General Vouchers)
router.post('/claim', async (req, res) => {
    const { voucher_id, user_id, device_id } = req.body;

    try {
        // Check voucher validity & quota
        const voucher = (await db.query('SELECT * FROM customer_vouchers WHERE id = $1 AND is_active = TRUE', [voucher_id]))[0];
        if (!voucher) return res.status(404).json({ error: 'Voucher not found or inactive' });

        if (voucher.quota !== null) {
            const claimedCount = (await db.query('SELECT COUNT(*) as count FROM user_vouchers WHERE voucher_id = $1', [voucher_id]))[0].count;
            if (claimedCount >= voucher.quota) return res.status(400).json({ error: 'Quota exceeded' });
        }

        // Check if already claimed
        let existingClaim;
        if (user_id) {
            existingClaim = (await db.query('SELECT * FROM user_vouchers WHERE voucher_id = $1 AND user_id = $2', [voucher_id, user_id]))[0];
        } else if (device_id) {
            existingClaim = (await db.query('SELECT * FROM user_vouchers WHERE voucher_id = $1 AND device_id = $2', [voucher_id, device_id]))[0];
        }

        if (existingClaim) return res.status(400).json({ error: 'Voucher already claimed' });

        // Insert Claim
        await db.query(
            `INSERT INTO user_vouchers (user_id, voucher_id, device_id) VALUES ($1, $2, $3)`,
            [user_id || null, voucher_id, device_id || null]
        );

        res.json({ success: true, message: 'Voucher claimed successfully' });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. GET /user/referral
router.get('/referral', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    try {
        const user = (await db.query('SELECT referral_code FROM users WHERE id = $1', [user_id]))[0];
        const referrals = (await db.query('SELECT COUNT(*) as total FROM users WHERE referred_by = (SELECT referral_code FROM users WHERE id = $1)', [user_id]))[0];

        res.json({
            referral_code: user?.referral_code || 'Belum Ada Code',
            total_referrals: parseInt(referrals.total)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
