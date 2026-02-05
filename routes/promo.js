import express from 'express';
import db from '../db.js';

const router = express.Router();

// -----------------------------------------------------------------
// PROMOTIONS (Buy X Get Y, etc)
// -----------------------------------------------------------------

// GET all promotions
router.get('/promotions', async (req, res) => {
    try {
        const promotions = await db.all(`
            SELECT p.*, mi1.name as buy_item_name, mi2.name as get_item_name
            FROM promotions p
            LEFT JOIN menu_items mi1 ON p.buy_item_id = mi1.id
            LEFT JOIN menu_items mi2 ON p.get_item_id = mi2.id
            ORDER BY p.created_at DESC
        `);
        res.json({ promotions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET active promotions for Public Web
router.get('/public/active', async (req, res) => {
    try {
        const promotions = await db.all(`
            SELECT * FROM promotions 
            WHERE (is_active::text = 'true' OR is_active::text = '1' OR is_active::text = 't')
            ORDER BY created_at DESC
        `);
        const discounts = await db.all(`
            SELECT * FROM discounts 
            WHERE (is_active::text = 'true' OR is_active::text = '1' OR is_active::text = 't')
            ORDER BY created_at DESC
        `);
        // Public web expects both in one response often, or separate
        res.json({ promotions, discounts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create promotion
router.post('/promotions', async (req, res) => {
    const { name, type, buy_item_id, get_item_id, buy_qty, get_qty, discount_percent, min_spend, is_active, start_date, end_date } = req.body;
    try {
        const isActiveVal = (is_active === 'true' || is_active === '1' || is_active === 1 || is_active === true) ? 1 : 0;

        let sql = `
            INSERT INTO promotions (name, type, buy_item_id, get_item_id, buy_qty, get_qty, discount_percent, min_spend, is_active, start_date, end_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;

        // Postgres needs RETURNING id to get the ID, SQLite uses lastId
        if (db.type === 'postgres') {
            sql += ' RETURNING id';
        }

        const result = await db.run(sql, [
            name, type, buy_item_id || null, get_item_id || null,
            Number(buy_qty) || 0, Number(get_qty) || 0, Number(discount_percent) || 0, Number(min_spend) || 0,
            isActiveVal, start_date || null, end_date || null
        ]);
        const id = (result.rows && result.rows[0]) ? result.rows[0].id : result.lastId;
        res.status(201).json({ id, message: 'Promo berhasil dibuat' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Promotion
router.put('/promotions/:id', async (req, res) => {
    const { name, type, buy_item_id, get_item_id, buy_qty, get_qty, discount_percent, min_spend, is_active, start_date, end_date } = req.body;
    try {
        const isActiveVal = (is_active === 'true' || is_active === '1' || is_active === 1 || is_active === true) ? 1 : 0;
        await db.run(`
            UPDATE promotions 
            SET name = $1, type = $2, buy_item_id = $3, get_item_id = $4, 
                buy_qty = $5, get_qty = $6, discount_percent = $7, min_spend = $8, is_active = $9,
                start_date = $10, end_date = $11,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $12
        `, [
            name, type, buy_item_id || null, get_item_id || null,
            Number(buy_qty) || 0, Number(get_qty) || 0, Number(discount_percent) || 0, Number(min_spend) || 0,
            isActiveVal, start_date || null, end_date || null,
            Number(req.params.id)
        ]);
        res.json({ message: 'Promo diperbarui' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete promotion
router.delete('/promotions/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM promotions WHERE id = $1', [Number(req.params.id)]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -----------------------------------------------------------------
// DISCOUNTS (Nominal/Percentage)
// -----------------------------------------------------------------

router.get('/discounts', async (req, res) => {
    try {
        const discounts = await db.all('SELECT * FROM discounts ORDER BY created_at DESC');
        res.json({ discounts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/discounts', async (req, res) => {
    const { name, code, type, value, min_purchase, max_discount, is_active, start_date, end_date } = req.body;
    try {
        const isActiveVal = (is_active === 'true' || is_active === '1' || is_active === 1 || is_active === true) ? 1 : 0;

        let sql = `
            INSERT INTO discounts (name, code, type, value, min_purchase, max_discount, is_active, start_date, end_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;

        if (db.type === 'postgres') {
            sql += ' RETURNING id';
        }

        const result = await db.run(sql, [
            name, code, type, Number(value), Number(min_purchase) || 0, Number(max_discount) || null, isActiveVal,
            start_date || null, end_date || null
        ]);
        const id = (result.rows && result.rows[0]) ? result.rows[0].id : result.lastId;
        res.status(201).json({ id, message: 'Diskon berhasil dibuat' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/discounts/:id', async (req, res) => {
    const { name, code, type, value, min_purchase, max_discount, is_active, start_date, end_date } = req.body;
    try {
        const isActiveVal = (is_active === 'true' || is_active === '1' || is_active === 1 || is_active === true) ? 1 : 0;
        await db.run(`
            UPDATE discounts 
            SET name = $1, code = $2, type = $3, value = $4, min_purchase = $5, max_discount = $6, is_active = $7,
                start_date = $8, end_date = $9,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
        `, [name, code, type, Number(value), Number(min_purchase) || 0, Number(max_discount) || null, isActiveVal,
            start_date || null, end_date || null, Number(req.params.id)]);
        res.json({ message: 'Diskon diperbarui' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/discounts/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM discounts WHERE id = $1', [Number(req.params.id)]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
