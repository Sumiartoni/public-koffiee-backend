import express from 'express';
import db from '../db.js';

const router = express.Router();

// =============================================
// ADMIN: CRUD Reward Products (Multi-Product)
// =============================================

// GET all rewards with their products
router.get('/', async (req, res) => {
    try {
        // Get rewards
        const rewards = (await db.query(`
            SELECT rp.* FROM reward_products rp ORDER BY rp.created_at DESC
        `)).rows;

        // Get product items for each reward
        for (const reward of rewards) {
            const products = (await db.query(`
                SELECT rpi.product_id, mi.name as product_name, mi.price as product_price, mi.image_url as product_image
                FROM reward_product_items rpi
                JOIN menu_items mi ON rpi.product_id = mi.id
                WHERE rpi.reward_id = $1
            `, [reward.id])).rows;

            reward.products = products;
            reward.product_ids = products.map(p => p.product_id);

            // Fallback: if no junction data but old product_id exists
            if (products.length === 0 && reward.product_id) {
                const oldProduct = (await db.query(
                    'SELECT id, name, price, image_url FROM menu_items WHERE id = $1', [reward.product_id]
                )).rows[0];
                if (oldProduct) {
                    reward.products = [{ product_id: oldProduct.id, product_name: oldProduct.name, product_price: oldProduct.price, product_image: oldProduct.image_url }];
                    reward.product_ids = [oldProduct.id];
                }
            }
        }
        console.log(`[REWARDS] Fetched ${rewards.length} rewards from DB.`);
        rewards.forEach(r => console.log(` - Reward: ${r.title} | Active: ${r.is_active} | Products: ${r.products?.length || 0}`));

        res.json(rewards);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CREATE reward with multiple products
router.post('/', async (req, res) => {
    const { title, product_ids, points_required, referral_required, quota } = req.body;

    if (!title) return res.status(400).json({ error: 'Title wajib diisi' });
    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
        return res.status(400).json({ error: 'Pilih minimal 1 produk' });
    }

    try {
        // Insert reward (product_id = first for backward compat)
        const result = await db.query(
            `INSERT INTO reward_products (title, product_id, points_required, referral_required, quota)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [title, product_ids[0], points_required || null, referral_required || null, quota || null]
        );
        const reward = result.rows[0];

        // Insert junction items
        for (const pid of product_ids) {
            await db.query(
                'INSERT INTO reward_product_items (reward_id, product_id) VALUES ($1, $2)',
                [reward.id, pid]
            );
        }

        reward.product_ids = product_ids;
        res.status(201).json(reward);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// UPDATE reward with multiple products
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { title, product_ids, points_required, referral_required, quota, is_active } = req.body;

    try {
        const result = await db.query(
            `UPDATE reward_products 
             SET title=$1, product_id=$2, points_required=$3, referral_required=$4, quota=$5, is_active=$6, updated_at=CURRENT_TIMESTAMP
             WHERE id=$7 RETURNING *`,
            [title, product_ids?.[0] || null, points_required || null, referral_required || null, quota || null, is_active, id]
        );

        // Replace junction items
        if (product_ids && Array.isArray(product_ids)) {
            await db.query('DELETE FROM reward_product_items WHERE reward_id = $1', [id]);
            for (const pid of product_ids) {
                await db.query(
                    'INSERT INTO reward_product_items (reward_id, product_id) VALUES ($1, $2)',
                    [id, pid]
                );
            }
        }

        const reward = result.rows[0];
        if (reward) reward.product_ids = product_ids;
        res.json(reward);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE reward
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM reward_products WHERE id = $1', [id]);
        res.json({ message: 'Reward deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// TOGGLE active/inactive
router.patch('/:id/toggle', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            `UPDATE reward_products SET is_active = NOT is_active, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,
            [id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// USER: Points & Rewards
// =============================================

// GET user total points + history
router.get('/user/:userId/points', async (req, res) => {
    const { userId } = req.params;
    try {
        const totalResult = await db.query(
            `SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points ELSE -points END), 0) as total_points 
             FROM user_points WHERE user_id = $1`,
            [userId]
        );
        const history = await db.query(
            'SELECT * FROM user_points WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
        res.json({
            total_points: parseInt(totalResult.rows[0].total_points),
            history: history.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET user rewards (unclaimed)
router.get('/user/:userId/rewards', async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await db.query(
            `SELECT ur.*, rp.title, rp.product_id, mi.name as product_name, mi.image_url as product_image
             FROM user_rewards ur
             JOIN reward_products rp ON ur.reward_id = rp.id
             LEFT JOIN menu_items mi ON rp.product_id = mi.id
             WHERE ur.user_id = $1 AND ur.is_used = FALSE
             ORDER BY ur.created_at DESC`,
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST redeem points for reward (with product_id validation)
router.post('/points/redeem', async (req, res) => {
    const { user_id, reward_id, product_id } = req.body;

    if (!user_id || !reward_id) {
        return res.status(400).json({ error: 'user_id dan reward_id wajib diisi' });
    }

    try {
        // 1. Get reward
        const reward = (await db.query(
            'SELECT * FROM reward_products WHERE id = $1 AND is_active = TRUE',
            [reward_id]
        )).rows[0];

        if (!reward) {
            return res.status(404).json({ error: 'Reward tidak ditemukan atau tidak aktif' });
        }

        if (!reward.points_required) {
            return res.status(400).json({ error: 'Reward ini bukan untuk penukaran poin' });
        }

        // 2. Validate product_id if provided
        if (product_id) {
            const validProduct = (await db.query(
                'SELECT * FROM reward_product_items WHERE reward_id = $1 AND product_id = $2',
                [reward_id, product_id]
            )).rows[0];

            if (!validProduct) {
                return res.status(400).json({ error: 'Produk tidak valid untuk reward ini' });
            }
        }

        // 3. Check quota
        if (reward.quota !== null && reward.quota <= 0) {
            return res.status(400).json({ error: 'Kuota reward sudah habis' });
        }

        // 4. Get user total points
        const totalResult = await db.query(
            `SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points ELSE -points END), 0) as total_points 
             FROM user_points WHERE user_id = $1`,
            [user_id]
        );
        const totalPoints = parseInt(totalResult.rows[0].total_points);

        if (totalPoints < reward.points_required) {
            return res.status(400).json({
                error: `Poin tidak cukup. Butuh ${reward.points_required}, tersedia ${totalPoints}`
            });
        }

        // 5. Deduct points
        await db.query(
            `INSERT INTO user_points (user_id, points, type, description) VALUES ($1, $2, 'redeem', $3)`,
            [user_id, reward.points_required, `Tukar reward: ${reward.title}`]
        );

        // 5b. Update denormalized users.points
        await db.query(
            'UPDATE users SET points = points - $1 WHERE id = $2',
            [reward.points_required, user_id]
        );

        // 6. Give reward to user
        await db.query(
            `INSERT INTO user_rewards (user_id, reward_id) VALUES ($1, $2)`,
            [user_id, reward_id]
        );

        // 7. Reduce quota
        if (reward.quota !== null) {
            await db.query(
                'UPDATE reward_products SET quota = quota - 1 WHERE id = $1',
                [reward_id]
            );
        }

        console.log(`[REWARD] User ${user_id} redeemed "${reward.title}" for ${reward.points_required} points`);

        res.json({
            success: true,
            message: `Berhasil menukar ${reward.points_required} poin untuk "${reward.title}"`,
            remaining_points: totalPoints - reward.points_required
        });

    } catch (error) {
        console.error('[REDEEM ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST use reward (mark as used during checkout)
router.post('/use', async (req, res) => {
    const { user_reward_id } = req.body;

    if (!user_reward_id) {
        return res.status(400).json({ error: 'user_reward_id wajib diisi' });
    }

    try {
        const result = await db.query(
            `UPDATE user_rewards SET is_used = TRUE, used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND is_used = FALSE RETURNING *`,
            [user_reward_id]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Reward tidak ditemukan atau sudah digunakan' });
        }

        res.json({ success: true, message: 'Reward berhasil digunakan' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
