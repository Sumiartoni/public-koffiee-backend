import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET referral stats
router.get('/stats', async (req, res) => {
    try {
        // List users with their referral count & rewards
        const query = `
            SELECT 
                u.id, 
                u.name, 
                u.referral_code,
                (SELECT COUNT(*) FROM users WHERE referred_by = u.referral_code) as total_referrals,
                (SELECT COUNT(*) FROM referral_rewards WHERE referrer_id = u.id AND reward_given = TRUE) as rewards_given
            FROM users u
            WHERE u.referral_code IS NOT NULL
            ORDER BY total_referrals DESC
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET referral details for a user
router.get('/:userId/details', async (req, res) => {
    const { userId } = req.params;
    try {
        const query = `
            SELECT id, name, created_at, is_verified 
            FROM users 
            WHERE referred_by = (SELECT referral_code FROM users WHERE id = $1)
            ORDER BY created_at DESC
        `;
        const result = await db.query(query, [userId]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/referrals/process
// Dipanggil setelah order pertama user berhasil
router.post('/process', async (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: 'user_id wajib diisi' });
    }

    try {
        // 1. Ambil data user
        const user = (await db.query(
            'SELECT * FROM users WHERE id = $1',
            [user_id]
        )).rows[0];

        if (!user) {
            return res.status(404).json({ error: 'User tidak ditemukan' });
        }

        // 2. Cek referred_by
        if (!user.referred_by) {
            return res.json({
                success: false,
                message: 'User tidak memiliki referral (referred_by kosong)'
            });
        }

        // 3. Cari user referrer berdasarkan referral_code
        const referrer = (await db.query(
            'SELECT * FROM users WHERE referral_code = $1',
            [user.referred_by]
        )).rows[0];

        if (!referrer) {
            return res.json({
                success: false,
                message: 'Referrer tidak ditemukan'
            });
        }

        // 4. Cek apakah reward sudah pernah diberikan
        const existingReward = (await db.query(
            'SELECT * FROM referral_rewards WHERE referrer_id = $1 AND referred_id = $2',
            [referrer.id, user_id]
        )).rows[0];

        if (existingReward) {
            return res.json({
                success: false,
                message: 'Reward referral sudah pernah diberikan'
            });
        }

        // 5. Ambil voucher referral yang aktif dan masih ada quota
        const voucher = (await db.query(
            `SELECT * FROM customer_vouchers 
             WHERE category = 'referral' 
             AND is_active = TRUE 
             AND (quota IS NULL OR quota > 0)
             ORDER BY id ASC
             LIMIT 1`
        )).rows[0];

        if (!voucher) {
            console.log(`[REFERRAL] No active referral voucher available`);
            return res.json({
                success: false,
                message: 'Tidak ada voucher referral yang tersedia'
            });
        }

        // 6a. Berikan voucher ke referrer
        await db.query(
            `INSERT INTO user_vouchers (user_id, voucher_id, is_used) VALUES ($1, $2, $3)`,
            [referrer.id, voucher.id, false]
        );

        // 6b. Berikan voucher ke user baru
        await db.query(
            `INSERT INTO user_vouchers (user_id, voucher_id, is_used) VALUES ($1, $2, $3)`,
            [user_id, voucher.id, false]
        );

        // 6c. Kurangi quota voucher 2x (untuk kedua pihak)
        if (voucher.quota !== null) {
            await db.query(
                'UPDATE customer_vouchers SET quota = quota - 2 WHERE id = $1',
                [voucher.id]
            );
        }

        // 7. Simpan log referral
        await db.query(
            `INSERT INTO referral_rewards (referrer_id, referred_id, reward_given) 
             VALUES ($1, $2, $3)`,
            [referrer.id, user_id, true]
        );

        console.log(`[REFERRAL] Reward given: referrer=${referrer.name}(${referrer.id}), referred=${user.name}(${user_id}), voucher="${voucher.title}"`);

        return res.json({
            success: true,
            message: 'Reward referral berhasil diberikan',
            referrer_voucher: {
                user_id: referrer.id,
                voucher_id: voucher.id,
                title: voucher.title,
                type: voucher.type,
                value: voucher.value
            },
            referred_voucher: {
                user_id: user_id,
                voucher_id: voucher.id,
                title: voucher.title,
                type: voucher.type,
                value: voucher.value
            }
        });

    } catch (error) {
        console.error('[REFERRAL PROCESS ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
