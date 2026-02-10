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

export default router;
