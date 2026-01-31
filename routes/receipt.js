import express from 'express';
import db from '../db.js';

const router = express.Router();

// Get All Templates
router.get('/', async (req, res) => {
    try {
        const templates = await db.all('SELECT * FROM receipt_templates ORDER BY id');
        res.json({ templates });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Default Template (Match mobile-api.js)
router.get('/default', async (req, res) => {
    try {
        const template = await db.get(`
            SELECT * FROM receipt_templates 
            WHERE is_default = TRUE 
            OR is_default::text = '1' 
            OR is_default::text = 'true'
            LIMIT 1
        `);
        res.json(template);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update or Create Template
router.post('/', async (req, res) => {
    try {
        const current = await db.get("SELECT id FROM receipt_templates WHERE is_default = TRUE OR is_default::text = '1' OR is_default::text = 'true'");

        const cols = [
            'name', 'header_text', 'footer_text', 'show_logo', 'show_address',
            'show_phone', 'show_date_time', 'show_cashier', 'show_order_number',
            'show_items', 'show_subtotal', 'show_tax', 'show_discount', 'show_total',
            'show_payment_method', 'show_change', 'show_thank_you', 'paper_width',
            'shop_address', 'shop_phone'
        ];

        const vals = cols.map(c => {
            const val = req.body[c];
            if (val === 'true' || val === true || val === 1) return true;
            if (val === 'false' || val === false || val === 0) return false;
            return val || null;
        });

        if (current) {
            let idx = 1;
            const setClause = cols.map(c => `${c} = $${idx++}`).join(', ');
            vals.push(current.id);
            await db.run(`UPDATE receipt_templates SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx}`, vals);
        } else {
            let idx = 1;
            const ph = cols.map(() => `$${idx++}`).join(', ');
            vals.push(true); // is_default
            await db.run(`INSERT INTO receipt_templates (${cols.join(', ')}, is_default) VALUES (${ph}, $${idx})`, vals);
        }
        res.json({ message: 'Template saved' });
    } catch (err) {
        console.error("[RECEIPT ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
