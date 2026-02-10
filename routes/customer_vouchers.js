import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET all vouchers (Admin)
router.get('/', async (req, res) => {
    try {
        const vouchers = await db.query('SELECT * FROM customer_vouchers ORDER BY created_at DESC');
        res.json(vouchers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CREATE a new voucher
router.post('/', async (req, res) => {
    const { title, description, category, type, value, max_discount, min_purchase, quota, validity_days, start_date, end_date } = req.body;

    try {
        const result = await db.query(
            `INSERT INTO customer_vouchers 
       (title, description, category, type, value, max_discount, min_purchase, quota, validity_days, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
            [title, description, category, type, value, max_discount || null, min_purchase || 0, quota || null, validity_days || 0, start_date || null, end_date || null]
        );
        res.status(201).json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// UPDATE a voucher
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, category, type, value, max_discount, min_purchase, quota, validity_days, start_date, end_date, is_active } = req.body;

    try {
        const result = await db.query(
            `UPDATE customer_vouchers 
       SET title=$1, description=$2, category=$3, type=$4, value=$5, max_discount=$6, min_purchase=$7, quota=$8, validity_days=$9, start_date=$10, end_date=$11, is_active=$12, updated_at=CURRENT_TIMESTAMP
       WHERE id=$13
       RETURNING *`,
            [title, description, category, type, value, max_discount, min_purchase, quota, validity_days, start_date, end_date, is_active, id]
        );
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE a voucher
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM customer_vouchers WHERE id = $1', [id]);
        res.json({ message: 'Voucher deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
