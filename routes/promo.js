import express from 'express';
import db from '../db.js';

const router = express.Router();

// -----------------------------------------------------------------
// PROMOTIONS (Buy X Get Y, etc)
// -----------------------------------------------------------------

// GET all promotions (Admin/POS)
router.get('/promotions', async (req, res) => {
    try {
        const promotions = await db.all(`
            SELECT p.*, mi1.name as buy_item_name, mi2.name as get_item_name, c.name as category_name
            FROM promotions p
            LEFT JOIN menu_items mi1 ON p.buy_item_id = mi1.id
            LEFT JOIN menu_items mi2 ON p.get_item_id = mi2.id
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY p.created_at DESC
        `);
        res.json({ promotions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET active promotions for Public Web (Filter based on logic)
router.get('/public/active', async (req, res) => {
    try {
        // PERINTAH: Program promo (Buy X Get Y) muncul di POS TANPA muncul di web pesan online
        const promotions = []; // Kosongkan untuk Public Web sesuai instruksi

        // PERINTAH: Program diskon yang sama seperti pada aplikasi mobile POS muncul di web
        // Voucher diskon muncul input masukkan kode voucher (Frontend handling)
        const discounts = await db.all(`
            SELECT d.*, c.name as category_name 
            FROM discounts d
            LEFT JOIN categories c ON d.category_id = c.id
            WHERE d.is_active = 1
            AND (d.start_date IS NULL OR d.start_date <= CURRENT_DATE)
            AND (d.end_date IS NULL OR d.end_date >= CURRENT_DATE)
            ORDER BY d.created_at DESC
        `);

        res.json({ promotions, discounts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET active promotions for Mobile POS
router.get('/pos/active', async (req, res) => {
    try {
        const promotions = await db.all(`
            SELECT * FROM promotions 
            WHERE is_active = 1
            AND (start_date IS NULL OR start_date <= CURRENT_DATE)
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)
            ORDER BY created_at DESC
        `);
        const discounts = await db.all(`
            SELECT d.*, c.name as category_name 
            FROM discounts d
            LEFT JOIN categories c ON d.category_id = c.id
            WHERE d.is_active = 1
            AND (d.start_date IS NULL OR d.start_date <= CURRENT_DATE)
            AND (d.end_date IS NULL OR d.end_date >= CURRENT_DATE)
            ORDER BY d.created_at DESC
        `);
        res.json({ promotions, discounts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create promotion
router.post('/promotions', async (req, res) => {
    let { name, description, type, buy_item_id, get_item_id, buy_qty, get_qty, min_purchase, start_date, end_date, is_active } = req.body;
    try {
        const isActiveVal = (is_active === 'true' || is_active === '1' || is_active === 1 || is_active === true) ? 1 : 0;

        // Sanitize: Convert empty strings to null for optional fields
        buy_item_id = (buy_item_id && buy_item_id !== "") ? Number(buy_item_id) : null;
        get_item_id = (get_item_id && get_item_id !== "") ? Number(get_item_id) : null;
        start_date = (start_date && start_date !== "") ? start_date : null;
        end_date = (end_date && end_date !== "") ? end_date : null;

        const result = await db.run(`
            INSERT INTO promotions (name, description, type, buy_item_id, get_item_id, buy_qty, get_qty, min_purchase, start_date, end_date, is_active, category_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
        `, [
            name, description || null, type, buy_item_id, get_item_id,
            Number(buy_qty) || 0, Number(get_qty) || 0, Number(min_purchase) || 0,
            start_date, end_date,
            isActiveVal,
            (req.body.category_id && req.body.category_id !== "") ? Number(req.body.category_id) : null
        ]);
        const id = (result.rows && result.rows[0]) ? result.rows[0].id : result.lastId;
        res.status(201).json({ id, message: 'Promo berhasil dibuat' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Promotion
router.put('/promotions/:id', async (req, res) => {
    let { name, description, type, buy_item_id, get_item_id, buy_qty, get_qty, min_purchase, start_date, end_date, is_active } = req.body;
    try {
        const isActiveVal = (is_active === 'true' || is_active === '1' || is_active === 1 || is_active === true) ? 1 : 0;

        // Sanitize
        buy_item_id = (buy_item_id && buy_item_id !== "") ? Number(buy_item_id) : null;
        get_item_id = (get_item_id && get_item_id !== "") ? Number(get_item_id) : null;
        start_date = (start_date && start_date !== "") ? start_date : null;
        end_date = (end_date && end_date !== "") ? end_date : null;

        await db.run(`
            UPDATE promotions 
            SET name = $1, description = $2, type = $3, buy_item_id = $4, get_item_id = $5, 
                buy_qty = $6, get_qty = $7, min_purchase = $8, start_date = $9, end_date = $10, is_active = $11,
                category_id = $12, updated_at = CURRENT_TIMESTAMP
            WHERE id = $13
        `, [
            name, description || null, type, buy_item_id, get_item_id,
            Number(buy_qty) || 0, Number(get_qty) || 0, Number(min_purchase) || 0,
            start_date, end_date,
            isActiveVal,
            (req.body.category_id && req.body.category_id !== "") ? Number(req.body.category_id) : null,
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
        const discounts = await db.all(`
            SELECT d.*, c.name as category_name
            FROM discounts d
            LEFT JOIN categories c ON d.category_id = c.id
            ORDER BY d.created_at DESC
        `);
        res.json({ discounts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/discounts', async (req, res) => {
    let { name, code, type, value, min_purchase, max_discount, start_date, end_date, is_active } = req.body;
    try {
        const isActiveVal = (is_active === 'true' || is_active === '1' || is_active === 1 || is_active === true) ? 1 : 0;

        // Sanitize
        start_date = (start_date && start_date !== "") ? start_date : null;
        end_date = (end_date && end_date !== "") ? end_date : null;
        code = (code && code !== "") ? code : null;
        max_discount = (max_discount && max_discount !== "") ? Number(max_discount) : null;

        const result = await db.run(`
            INSERT INTO discounts (name, code, type, value, min_purchase, max_discount, start_date, end_date, is_active, category_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `, [
            name, code, type, Number(value), Number(min_purchase) || 0,
            max_discount, start_date, end_date, isActiveVal,
            (req.body.category_id && req.body.category_id !== "") ? Number(req.body.category_id) : null
        ]);
        const id = (result.rows && result.rows[0]) ? result.rows[0].id : result.lastId;
        res.status(201).json({ id, message: 'Diskon berhasil dibuat' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/discounts/:id', async (req, res) => {
    let { name, code, type, value, min_purchase, max_discount, start_date, end_date, is_active } = req.body;
    try {
        const isActiveVal = (is_active === 'true' || is_active === '1' || is_active === 1 || is_active === true) ? 1 : 0;

        // Sanitize
        start_date = (start_date && start_date !== "") ? start_date : null;
        end_date = (end_date && end_date !== "") ? end_date : null;
        code = (code && code !== "") ? code : null;
        max_discount = (max_discount && max_discount !== "") ? Number(max_discount) : null;

        await db.run(`
            UPDATE discounts 
            SET name = $1, code = $2, type = $3, value = $4, min_purchase = $5, max_discount = $6, 
                start_date = $7, end_date = $8, is_active = $9, category_id = $10,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
        `, [
            name, code, type, Number(value), Number(min_purchase) || 0,
            max_discount, start_date, end_date, isActiveVal,
            (req.body.category_id && req.body.category_id !== "") ? Number(req.body.category_id) : null,
            Number(req.params.id)
        ]);
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
