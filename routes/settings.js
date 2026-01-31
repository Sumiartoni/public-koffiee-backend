import express from 'express';
import db from '../db.js';

const router = express.Router();

// Get All Settings
router.get('/', async (req, res) => {
    try {
        const rows = await db.all('SELECT key, value FROM settings');
        const settings = rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Settings (Batch)
router.post('/', async (req, res) => {
    const settings = req.body;
    try {
        for (const [key, value] of Object.entries(settings)) {
            const exists = await db.get('SELECT key FROM settings WHERE key = $1', [key]);
            if (exists) {
                await db.run('UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2', [String(value), key]);
            } else {
                await db.run('INSERT INTO settings (key, value) VALUES ($1, $2)', [key, String(value)]);
            }
        }
        res.json({ message: 'Settings updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
