import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET all expenses (with optional date filtering)
router.get('/', async (req, res) => {
    const { start_date, end_date } = req.query;
    try {
        let sql = 'SELECT * FROM expenses';
        let params = [];

        if (start_date && end_date) {
            sql += ' WHERE expense_date BETWEEN $1 AND $2';
            params.push(start_date, end_date);
        } else if (start_date) {
            sql += ' WHERE expense_date = $1';
            params.push(start_date);
        }

        sql += ' ORDER BY expense_date DESC, created_at DESC';
        const expenses = await db.all(sql, params);
        res.json({ expenses });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new expense
router.post('/', async (req, res) => {
    const { amount, category, description, expense_date, payment_method, notes } = req.body;
    try {
        const result = await db.run(`
            INSERT INTO expenses (amount, category, description, expense_date, payment_method, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `, [
            Number(amount),
            category,
            description,
            expense_date || new Date().toISOString().slice(0, 10),
            payment_method || 'cash',
            notes || ''
        ]);
        const newId = (result.rows && result.rows[0]) ? result.rows[0].id : result.lastId;
        res.status(201).json({ id: newId, message: 'Pengeluaran dicatat' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET summary for a specific date
router.get('/summary/daily', async (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    try {
        const summary = await db.get(`
            SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
            FROM expenses
            WHERE expense_date = $1
        `, [targetDate]);
        res.json(summary);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Categories
router.get('/categories/all', async (req, res) => {
    try {
        const categories = await db.all('SELECT * FROM expense_categories ORDER BY name');
        res.json({ categories });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/categories', async (req, res) => {
    const { name, emoji } = req.body;
    try {
        const result = await db.run('INSERT INTO expense_categories (name, emoji) VALUES ($1, $2) RETURNING id', [name, emoji]);
        const newId = (result.rows && result.rows[0]) ? result.rows[0].id : result.lastId;
        res.status(201).json({ id: newId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete expense
router.delete('/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM expenses WHERE id = $1', [Number(req.params.id)]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
