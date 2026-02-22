import express from 'express';
import db from '../db.js';

const router = express.Router();

// =============================================
// ADMIN: Loyalty Settings CRUD
// =============================================

// GET active loyalty settings
router.get('/settings', async (req, res) => {
    try {
        const settings = await db.get(
            'SELECT * FROM loyalty_settings WHERE is_active = true ORDER BY id DESC LIMIT 1'
        );
        res.json(settings || { point_per_rupiah: 0.001, min_purchase: 0, is_active: false });
    } catch (error) {
        console.error('[LOYALTY SETTINGS GET ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT update/upsert loyalty settings (single row)
router.put('/settings', async (req, res) => {
    const { point_per_rupiah, min_purchase, is_active } = req.body;

    if (point_per_rupiah === undefined || point_per_rupiah === null) {
        return res.status(400).json({ error: 'point_per_rupiah wajib diisi' });
    }

    try {
        // Check if row exists
        const existing = await db.get('SELECT id FROM loyalty_settings ORDER BY id DESC LIMIT 1');

        let result;
        if (existing) {
            // Update existing row
            result = await db.query(
                `UPDATE loyalty_settings 
                 SET point_per_rupiah = $1, min_purchase = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = $4 RETURNING *`,
                [point_per_rupiah, min_purchase || 0, is_active !== false, existing.id]
            );
        } else {
            // Insert new row
            result = await db.query(
                `INSERT INTO loyalty_settings (point_per_rupiah, min_purchase, is_active) 
                 VALUES ($1, $2, $3) RETURNING *`,
                [point_per_rupiah, min_purchase || 0, is_active !== false]
            );
        }

        const settings = result.rows[0];
        console.log(`[LOYALTY] Settings updated: ${settings.point_per_rupiah} pts/rupiah, min: Rp${settings.min_purchase}`);
        res.json(settings);
    } catch (error) {
        console.error('[LOYALTY SETTINGS UPDATE ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// USER: Points API (for customer app)
// =============================================

// GET /api/loyalty/user/:userId/points — total points
router.get('/user/:userId/points', async (req, res) => {
    const { userId } = req.params;
    try {
        const totalResult = await db.query(
            `SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points ELSE -points END), 0) as total_points 
             FROM user_points WHERE user_id = $1`,
            [userId]
        );
        res.json({ points: parseInt(totalResult.rows[0].total_points) });
    } catch (error) {
        console.error('[LOYALTY USER POINTS ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/loyalty/user/:userId/point-history — paginated history
router.get('/user/:userId/point-history', async (req, res) => {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    try {
        const countResult = await db.query(
            'SELECT COUNT(*) as total FROM user_points WHERE user_id = $1',
            [userId]
        );
        const total = parseInt(countResult.rows[0].total);

        const history = await db.query(
            `SELECT id, user_id, order_id, points, type, description, created_at
             FROM user_points 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        res.json({
            data: history.rows,
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('[LOYALTY POINT HISTORY ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
