import express from 'express';
import db from '../db.js';

const router = express.Router();

// =============================================
// CORE: checkReferralEligibility (idempotent)
// =============================================
async function checkReferralEligibility(userId) {
    // 1. Count total referrals for this user
    const totalResult = await db.query(
        `SELECT COUNT(*) as total FROM referral_rewards WHERE referrer_id = $1`,
        [userId]
    );
    const totalReferrals = parseInt(totalResult.rows[0].total);

    if (totalReferrals === 0) return { total_referrals: 0, rewards_granted: [] };

    // 2. Get all active reward_products with referral_required
    const rewards = (await db.query(
        `SELECT * FROM reward_products WHERE referral_required IS NOT NULL AND is_active = TRUE`
    )).rows;

    const rewardsGranted = [];

    for (const reward of rewards) {
        // 3. How many times is the user eligible for this reward?
        const eligibleClaims = Math.floor(totalReferrals / reward.referral_required);

        if (eligibleClaims <= 0) continue;

        // 4. How many times has this reward already been given?
        const givenResult = await db.query(
            `SELECT COUNT(*) as given FROM user_rewards WHERE user_id = $1 AND reward_id = $2 AND source = 'referral'`,
            [userId, reward.id]
        );
        const alreadyGiven = parseInt(givenResult.rows[0].given);

        // 5. Grant missing rewards
        const toGrant = eligibleClaims - alreadyGiven;
        if (toGrant <= 0) continue;

        // Check quota
        let availableQuota = toGrant;
        if (reward.quota !== null) {
            availableQuota = Math.min(toGrant, reward.quota);
            if (availableQuota <= 0) continue;
        }

        for (let i = 0; i < availableQuota; i++) {
            await db.query(
                `INSERT INTO user_rewards (user_id, reward_id, source) VALUES ($1, $2, 'referral')`,
                [userId, reward.id]
            );
        }

        // Deduct quota
        if (reward.quota !== null) {
            await db.query(
                'UPDATE reward_products SET quota = quota - $1 WHERE id = $2',
                [availableQuota, reward.id]
            );
        }

        rewardsGranted.push({
            reward_id: reward.id,
            title: reward.title,
            count: availableQuota
        });

        console.log(`[REFERRAL] Granted ${availableQuota}x "${reward.title}" to user ${userId} (total referrals: ${totalReferrals}, eligible: ${eligibleClaims}, already: ${alreadyGiven})`);
    }

    return { total_referrals: totalReferrals, rewards_granted: rewardsGranted };
}

// =============================================
// ADMIN: Referral Stats
// =============================================

// GET referral stats (all users)
router.get('/stats', async (req, res) => {
    try {
        const query = `
            SELECT 
                u.id, 
                u.name, 
                u.referral_code,
                (SELECT COUNT(*) FROM referral_rewards WHERE referrer_id = u.id) as total_referrals,
                (SELECT COUNT(*) FROM user_rewards WHERE user_id = u.id AND source = 'referral') as rewards_given
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
            SELECT u.id, u.name, u.created_at, u.is_verified 
            FROM referral_rewards rr
            JOIN users u ON u.id = rr.referred_id
            WHERE rr.referrer_id = $1
            ORDER BY rr.created_at DESC
        `;
        const result = await db.query(query, [userId]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// USER: Referral Info (for customer app)
// =============================================

// GET /api/referrals/user/:userId/info
router.get('/user/:userId/info', async (req, res) => {
    const { userId } = req.params;
    try {
        // 1. Get user's referral code
        const user = (await db.query(
            'SELECT id, referral_code FROM users WHERE id = $1', [userId]
        )).rows[0];

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Auto-generate referral_code if missing
        let referralCode = user.referral_code;
        if (!referralCode) {
            referralCode = 'PK' + Math.random().toString(36).substring(2, 8).toUpperCase();
            await db.query('UPDATE users SET referral_code = $1 WHERE id = $2', [referralCode, userId]);
            console.log(`[REFERRAL] Auto-generated code ${referralCode} for user ${userId}`);
        }

        // 2. Count referrals from referral_rewards table
        let totalReferrals = 0;
        try {
            const refCount = (await db.query(
                'SELECT COUNT(*) as total FROM referral_rewards WHERE referrer_id = $1', [userId]
            )).rows[0];
            totalReferrals = parseInt(refCount.total);
        } catch (e) {
            console.warn('[REFERRAL] referral_rewards table error:', e.message);
        }

        // 3. Get next reward milestone from reward_products
        let nextMilestone = null;
        try {
            const nextReward = (await db.query(`
                SELECT rp.id, rp.title, rp.referral_required,
                       (SELECT COUNT(*) FROM user_rewards WHERE user_id = $1 AND reward_id = rp.id AND source = 'referral') as already_given
                FROM reward_products rp 
                WHERE rp.referral_required IS NOT NULL 
                AND rp.is_active = TRUE
                ORDER BY rp.referral_required ASC
                LIMIT 1
            `, [userId])).rows[0];

            if (nextReward) {
                const alreadyGiven = parseInt(nextReward.already_given);
                const nextTarget = (alreadyGiven + 1) * nextReward.referral_required;
                nextMilestone = {
                    reward_title: nextReward.title,
                    referral_required: nextReward.referral_required,
                    next_target: nextTarget,
                    progress: totalReferrals,
                    rewards_earned: alreadyGiven
                };
            }
        } catch (e) {
            console.warn('[REFERRAL] milestone query error:', e.message);
        }

        res.json({
            referral_code: referralCode,
            total_referrals: totalReferrals,
            next_milestone: nextMilestone
        });
    } catch (error) {
        console.error('[REFERRAL INFO ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/referrals/process (kept for manual trigger / backward compat)
router.post('/process', async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id wajib diisi' });

    try {
        const user = (await db.query('SELECT * FROM users WHERE id = $1', [user_id])).rows[0];
        if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
        if (!user.referred_by) return res.json({ success: false, message: 'User tidak memiliki referral' });

        // Find referrer
        const referrer = (await db.query(
            'SELECT * FROM users WHERE referral_code = $1', [user.referred_by]
        )).rows[0];
        if (!referrer) return res.json({ success: false, message: 'Referrer tidak ditemukan' });

        // Check if already recorded
        const existing = (await db.query(
            'SELECT id FROM referral_rewards WHERE referred_id = $1', [user_id]
        )).rows[0];

        if (existing) {
            return res.json({ success: false, message: 'Referral sudah tercatat sebelumnya' });
        }

        // Validate not self-referral
        if (referrer.id === user.id) {
            return res.json({ success: false, message: 'Tidak bisa referral diri sendiri' });
        }

        // Record referral
        await db.query(
            `INSERT INTO referral_rewards (referrer_id, referred_id) VALUES ($1, $2)`,
            [referrer.id, user_id]
        );

        // Check eligibility and auto-grant rewards
        const result = await checkReferralEligibility(referrer.id);

        console.log(`[REFERRAL] Processed: referrer=${referrer.name}(${referrer.id}), referred=${user.name}(${user_id}), total=${result.total_referrals}`);

        return res.json({
            success: true,
            message: 'Referral berhasil diproses',
            ...result
        });
    } catch (error) {
        console.error('[REFERRAL PROCESS ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});

export { checkReferralEligibility };
export default router;
