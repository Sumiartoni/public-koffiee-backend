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
// Memberikan reward PRODUK (bukan voucher) berdasarkan milestone referral
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

        // 3. Cari referrer berdasarkan referral_code
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

        // 4. Cek apakah reward sudah pernah diberikan untuk pasangan ini
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

        // 5. Log referral dulu
        await db.query(
            `INSERT INTO referral_rewards (referrer_id, referred_id, reward_given) VALUES ($1, $2, $3)`,
            [referrer.id, user_id, true]
        );

        // 6. Hitung total referral milik referrer
        const totalReferrals = (await db.query(
            `SELECT COUNT(*) as total FROM referral_rewards WHERE referrer_id = $1 AND reward_given = TRUE`,
            [referrer.id]
        )).rows[0].total;

        // 7. Cek apakah ada reward produk untuk milestone ini
        const reward = (await db.query(
            `SELECT * FROM reward_products 
             WHERE referral_required = $1 
             AND is_active = TRUE 
             AND (quota IS NULL OR quota > 0)
             LIMIT 1`,
            [parseInt(totalReferrals)]
        )).rows[0];

        let rewardGiven = null;

        if (reward) {
            // Berikan reward produk ke referrer
            await db.query(
                `INSERT INTO user_rewards (user_id, reward_id) VALUES ($1, $2)`,
                [referrer.id, reward.id]
            );

            // Kurangi quota
            if (reward.quota !== null) {
                await db.query(
                    'UPDATE reward_products SET quota = quota - 1 WHERE id = $1',
                    [reward.id]
                );
            }

            rewardGiven = {
                reward_id: reward.id,
                title: reward.title,
                product_id: reward.product_id
            };

            console.log(`[REFERRAL] Milestone reward "${reward.title}" given to referrer ${referrer.name} (total referrals: ${totalReferrals})`);
        }

        console.log(`[REFERRAL] Processed: referrer=${referrer.name}(${referrer.id}), referred=${user.name}(${user_id}), total=${totalReferrals}`);

        return res.json({
            success: true,
            message: 'Referral berhasil diproses',
            total_referrals: parseInt(totalReferrals),
            reward: rewardGiven
        });

    } catch (error) {
        console.error('[REFERRAL PROCESS ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
