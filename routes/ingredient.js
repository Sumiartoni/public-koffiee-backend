import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET all ingredients
router.get('/', async (req, res) => {
    try {
        const ingredients = await db.all('SELECT * FROM ingredients ORDER BY name');
        res.json({ ingredients });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new ingredient
router.post('/', async (req, res) => {
    const { name, unit, price_per_unit, stock_qty, min_stock } = req.body;
    try {
        const result = await db.run(`
            INSERT INTO ingredients (name, unit, price_per_unit, stock_qty, min_stock)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [name, unit, price_per_unit || 0, stock_qty || 0, min_stock || 0]);
        const newId = result.rows[0].id;
        res.status(201).json({ id: newId, message: 'Bahan baku disimpan' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update ingredient
router.put('/:id', async (req, res) => {
    const { name, unit, price_per_unit, stock_qty, min_stock } = req.body;
    try {
        await db.run(`
            UPDATE ingredients 
            SET name = $1, unit = $2, price_per_unit = $3, stock_qty = $4, min_stock = $5
            WHERE id = $6
        `, [name, unit, price_per_unit, stock_qty, min_stock, req.params.id]);
        res.json({ message: 'Bahan baku diperbarui' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete ingredient
router.delete('/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM ingredients WHERE id = $1', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET recipe for a menu item
router.get('/recipe/:menuItemId', async (req, res) => {
    try {
        const recipe = await db.all(`
            SELECT r.*, i.name as ingredient_name, i.unit as ingredient_unit, i.price_per_unit
            FROM recipes r
            JOIN ingredients i ON r.ingredient_id = i.id
            WHERE r.menu_item_id = $1
        `, [req.params.menuItemId]);
        res.json({ recipe });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Set recipe for a menu item
router.post('/recipe/:menuItemId', async (req, res) => {
    const { recipe } = req.body;
    const menuItemId = req.params.menuItemId;
    try {
        await db.run('DELETE FROM recipes WHERE menu_item_id = $1', [menuItemId]);
        if (recipe && recipe.length > 0) {
            for (const item of recipe) {
                if (!item.ingredient_id || !item.quantity) continue;
                await db.run(`
                    INSERT INTO recipes (menu_item_id, ingredient_id, quantity)
                    VALUES ($1, $2, $3)
                `, [menuItemId, item.ingredient_id, item.quantity]);
            }
        }
        const hppRecord = await db.get(`
            SELECT SUM(r.quantity * i.price_per_unit) as total_hpp
            FROM recipes r
            JOIN ingredients i ON r.ingredient_id = i.id
            WHERE r.menu_item_id = $1
        `, [menuItemId]);
        const totalHpp = hppRecord.total_hpp || 0;
        await db.run('UPDATE menu_items SET hpp = $1, hpp_type = $2 WHERE id = $3', [totalHpp, 'recipe', menuItemId]);
        res.json({ message: 'Resep disimpan & HPP diupdate', hpp: totalHpp });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
