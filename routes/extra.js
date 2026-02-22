import express from 'express';
import db from '../db.js';

const router = express.Router();

// =============================================
// EXTRA CATEGORIES CRUD
// =============================================

// GET all categories (with extras count)
router.get('/categories', async (req, res) => {
    try {
        const categories = await db.all(`
            SELECT ec.*, 
                   COALESCE(cnt.total, 0) AS extras_count
            FROM extra_categories ec
            LEFT JOIN (SELECT category_id, COUNT(*) AS total FROM extras GROUP BY category_id) cnt 
                ON cnt.category_id = ec.id
            ORDER BY ec.sort_order, ec.name
        `);
        res.json({ categories });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE category
router.post('/categories', async (req, res) => {
    const { name, is_required, max_select, sort_order } = req.body;
    try {
        const result = await db.run(`
            INSERT INTO extra_categories (name, is_required, max_select, sort_order)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [name, is_required || false, max_select || 1, sort_order || 0]);

        const id = (result.rows && result.rows[0]) ? result.rows[0].id : result.lastId;
        res.status(201).json({ id, message: 'Category created' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE category
router.put('/categories/:id', async (req, res) => {
    const { name, is_required, max_select, sort_order, is_active } = req.body;
    const id = Number(req.params.id);
    try {
        await db.run(`
            UPDATE extra_categories
            SET name = $1, is_required = $2, max_select = $3, sort_order = $4, is_active = $5
            WHERE id = $6
        `, [name, is_required || false, max_select || 1, sort_order || 0, is_active !== undefined ? is_active : 1, id]);
        res.json({ message: 'Category updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE category (cascades extras to null category)
router.delete('/categories/:id', async (req, res) => {
    const id = Number(req.params.id);
    try {
        // Remove linked menu items first
        await db.run('DELETE FROM menu_item_extra_categories WHERE extra_category_id = $1', [id]);
        // Nullify category on extras
        await db.run('UPDATE extras SET category_id = NULL WHERE category_id = $1', [id]);
        await db.run('DELETE FROM extra_categories WHERE id = $1', [id]);
        res.json({ message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// EXTRAS CRUD (within categories)
// =============================================

// GET all extras (optionally filter by category)
router.get('/', async (req, res) => {
    try {
        const { category_id } = req.query;
        let extras;
        if (category_id) {
            extras = await db.all('SELECT * FROM extras WHERE category_id = $1 ORDER BY name', [category_id]);
        } else {
            extras = await db.all(`
                SELECT e.*, ec.name AS category_name 
                FROM extras e
                LEFT JOIN extra_categories ec ON e.category_id = ec.id
                ORDER BY ec.sort_order, ec.name, e.name
            `);
        }
        res.json({ extras });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE extra
router.post('/', async (req, res) => {
    const { name, price, is_active, category_id } = req.body;
    try {
        const numPrice = Number(price) || 0;
        const isActiveVal = (is_active === 'true' || is_active === '1' || is_active === 1 || is_active === true) ? 1 : 0;

        const result = await db.run(`
            INSERT INTO extras (name, price, is_active, category_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [name, numPrice, isActiveVal, category_id || null]);

        const id = (result.rows && result.rows[0]) ? result.rows[0].id : result.lastId;
        res.status(201).json({ id, message: 'Extra created' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE extra
router.put('/:id', async (req, res) => {
    const { name, price, is_active, category_id } = req.body;
    const id = Number(req.params.id);
    try {
        const numPrice = Number(price) || 0;
        const isActiveVal = (is_active === 'true' || is_active === '1' || is_active === 1 || is_active === true) ? 1 : 0;

        await db.run(`
            UPDATE extras 
            SET name = $1, price = $2, is_active = $3, category_id = $4, updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
        `, [name, numPrice, isActiveVal, category_id || null, id]);

        res.json({ message: 'Extra updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE extra
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

// =============================================
// LINK EXTRA CATEGORIES TO MENU ITEMS
// =============================================

// GET categories linked to a menu item (with nested extras)
router.get('/menu-item/:menuItemId', async (req, res) => {
    const menuItemId = Number(req.params.menuItemId);
    try {
        // Get linked categories
        const categories = await db.all(`
            SELECT ec.* FROM extra_categories ec
            JOIN menu_item_extra_categories miec ON ec.id = miec.extra_category_id
            WHERE miec.menu_item_id = $1
            ORDER BY ec.sort_order, ec.name
        `, [menuItemId]);

        // Get extras for each category
        for (const cat of categories) {
            const extras = await db.all(
                'SELECT * FROM extras WHERE category_id = $1 AND is_active = 1 ORDER BY name',
                [cat.id]
            );
            cat.extras = extras;
        }

        res.json({ categories });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET linked category IDs for a menu item (for backoffice checkbox)
router.get('/menu-item/:menuItemId/category-ids', async (req, res) => {
    const menuItemId = Number(req.params.menuItemId);
    try {
        const rows = await db.all(
            'SELECT extra_category_id FROM menu_item_extra_categories WHERE menu_item_id = $1',
            [menuItemId]
        );
        res.json({ categoryIds: rows.map(r => r.extra_category_id) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LINK categories to menu item (replace all)
router.post('/menu-item/:menuItemId', async (req, res) => {
    const { categoryIds } = req.body;
    const menuItemId = Number(req.params.menuItemId);
    try {
        await db.run('DELETE FROM menu_item_extra_categories WHERE menu_item_id = $1', [menuItemId]);

        if (categoryIds && Array.isArray(categoryIds)) {
            for (const catId of categoryIds) {
                await db.run(
                    'INSERT INTO menu_item_extra_categories (menu_item_id, extra_category_id) VALUES ($1, $2)',
                    [menuItemId, Number(catId)]
                );
            }
        }
        res.json({ message: 'Kategori extra berhasil dihubungkan' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
