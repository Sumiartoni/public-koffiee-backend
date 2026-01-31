import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET all extras
router.get('/', async (req, res) => {
    try {
        const extras = await db.all('SELECT * FROM extras ORDER BY name');
        res.json({ extras });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create extra
router.post('/', async (req, res) => {
    const { name, price, is_active } = req.body;
    try {
        console.log(`[EXTRA] Creating variant: ${name}`);
        const numPrice = Number(price) || 0;
        const isActiveVal = (is_active === 'true' || is_active === '1' || is_active === 1 || is_active === true) ? 1 : 0;

        const result = await db.run(`
            INSERT INTO extras (name, price, is_active)
            VALUES ($1, $2, $3)
            RETURNING id
        `, [name, numPrice, isActiveVal]);

        const id = (result.rows && result.rows[0]) ? result.rows[0].id : result.lastId;
        res.status(201).json({ id, message: 'Variant created' });
    } catch (err) {
        console.error("[EXTRA CREATE ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

// Update extra
router.put('/:id', async (req, res) => {
    const { name, price, is_active } = req.body;
    const id = Number(req.params.id);
    try {
        console.log(`[EXTRA] Updating variant ID: ${id}`);
        const numPrice = Number(price) || 0;
        const isActiveVal = (is_active === 'true' || is_active === '1' || is_active === 1 || is_active === true) ? 1 : 0;

        await db.run(`
            UPDATE extras 
            SET name = $1, price = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [name, numPrice, isActiveVal, id]);

        res.json({ message: 'Variant updated' });
    } catch (err) {
        console.error("[EXTRA UPDATE ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

// Get extras for a specific menu item
router.get('/menu-item/:menuItemId', async (req, res) => {
    const menuItemId = Number(req.params.menuItemId);
    try {
        const extras = await db.all(`
            SELECT e.* FROM extras e
            JOIN menu_item_extras mie ON e.id = mie.extra_id
            WHERE mie.menu_item_id = $1
        `, [menuItemId]);
        res.json({ extras });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Link extras to menu item (Match frontend api.js)
router.post('/menu-item/:menuItemId', async (req, res) => {
    const { extraIds } = req.body; // Frontend sends 'extraIds' not 'extra_ids'
    const menuItemId = Number(req.params.menuItemId);
    try {
        console.log(`[EXTRA] Linking variants to MenuItem: ${menuItemId}`, extraIds);

        await db.run('DELETE FROM menu_item_extras WHERE menu_item_id = $1', [menuItemId]);

        if (extraIds && Array.isArray(extraIds)) {
            for (const eid of extraIds) {
                await db.run('INSERT INTO menu_item_extras (menu_item_id, extra_id) VALUES ($1, $2)', [menuItemId, Number(eid)]);
            }
        }
        res.json({ message: 'Varian extra berhasil dihubungkan' });
    } catch (err) {
        console.error("[LINK EXTRA ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

// Delete extra
router.delete('/:id', async (req, res) => {
    const id = Number(req.params.id);
    try {
        await db.run('DELETE FROM menu_item_extras WHERE extra_id = $1', [id]);
        await db.run('DELETE FROM extras WHERE id = $1', [id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
