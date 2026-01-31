import express from 'express';
import db from '../db.js';
import multer from 'multer';
import { extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import cloudinary from '../config/cloudinary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Helper function to upload buffer to Cloudinary
const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'menu_items' },
            (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            }
        );
        uploadStream.end(fileBuffer);
    });
};

// 1. PUBLIC MENU
router.get('/', async (req, res) => {
    const { category } = req.query;
    let sql = `
        SELECT m.*, c.name as category_name, c.slug as category_slug
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE (m.is_available = TRUE OR m.is_available = 1 OR m.is_available::text = 'true' OR m.is_available::text = '1' OR m.is_available::text = 't' OR m.is_available IS NULL)
    `;
    const params = [];
    if (category && category !== 'all') {
        sql += ' AND c.slug = $1';
        params.push(category);
    }
    sql += ' ORDER BY c.display_order, m.display_order, m.name';

    try {
        const items = await db.all(sql, params);
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');

        const itemsWithUrls = await Promise.all(items.map(async item => {
            const extras = await db.all(`
                SELECT e.* FROM extras e
                JOIN menu_item_extras mie ON e.id = mie.extra_id
                WHERE mie.menu_item_id = $1 AND (e.is_active::text = 'true' OR e.is_active::text = '1' OR e.is_active::text = 't')
            `, [item.id]);

            return {
                ...item,
                extras,
                image_url: item.image_url ? (item.image_url.startsWith('http') ? item.image_url : `${protocol}://${host}/uploads/${item.image_url}`) : null
            };
        }));
        res.json({ items: itemsWithUrls });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. ADMIN MENU
router.get('/admin/all', async (req, res) => {
    try {
        const items = await db.all(`SELECT m.*, c.name as category_name FROM menu_items m LEFT JOIN categories c ON m.category_id = c.id ORDER BY m.created_at DESC`);
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const itemsWithUrls = await Promise.all(items.map(async item => {
            const extras = await db.all(`SELECT e.* FROM extras e JOIN menu_item_extras mie ON e.id = mie.extra_id WHERE mie.menu_item_id = $1`, [item.id]);
            return {
                ...item,
                extras,
                image_url: item.image_url ? (item.image_url.startsWith('http') ? item.image_url : `${protocol}://${host}/uploads/${item.image_url}`) : null
            };
        }));
        res.json({ items: itemsWithUrls });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. CATEGORIES
router.get('/categories/all', async (req, res) => {
    try {
        const categories = await db.all(`SELECT * FROM categories WHERE (is_active::text = 'true' OR is_active::text = '1' OR is_active::text = 't') ORDER BY display_order ASC`);
        res.json({ categories });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/categories', async (req, res) => {
    const { name, emoji } = req.body;
    const slug = name.toLowerCase().replace(/ /g, '-');
    try {
        const result = await db.run(`INSERT INTO categories (name, slug, emoji, is_active, display_order) VALUES ($1, $2, $3, 1, 0) RETURNING id`, [name, slug, emoji]);
        res.status(201).json({ id: result.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/categories/:id', async (req, res) => {
    try {
        const catId = req.params.id;
        const items = await db.all('SELECT id FROM menu_items WHERE category_id = $1', [catId]);
        for (const item of items) {
            await db.run('DELETE FROM recipes WHERE menu_item_id = $1', [item.id]);
            await db.run('DELETE FROM order_items WHERE menu_item_id = $1', [item.id]);
            await db.run('DELETE FROM promotions WHERE buy_item_id = $1 OR get_item_id = $2', [item.id, item.id]);
            await db.run('DELETE FROM menu_items WHERE id = $1', [item.id]);
        }
        await db.run('DELETE FROM categories WHERE id = $1', [catId]);
        res.json({ message: 'Category deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. CREATE MENU
router.post('/', upload.single('image'), async (req, res) => {
    try {
        const { name, category_id, price, description, emoji, hpp, hpp_type, is_available } = req.body;

        let image_url = null;
        if (req.file) {
            image_url = await uploadToCloudinary(req.file.buffer);
        }

        const available = (is_available === 'true' || is_available === '1' || is_available === 1 || is_available === true);
        const result = await db.run(`
            INSERT INTO menu_items (name, category_id, price, hpp, hpp_type, description, emoji, image_url, is_available)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
        `, [name, Number(category_id), Math.round(Number(price)), Math.round(Number(hpp || 0)), hpp_type || 'manual', description, emoji, image_url, available]);
        res.status(201).json({ id: result.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', upload.single('image'), async (req, res) => {
    const { name, category_id, price, description, emoji, is_available, hpp, hpp_type } = req.body;
    try {
        let fields = [];
        let params = [];
        let idx = 1;
        if (name) { fields.push(`name = $${idx++}`); params.push(name); }
        if (category_id) { fields.push(`category_id = $${idx++}`); params.push(Number(category_id)); }
        if (price) { fields.push(`price = $${idx++}`); params.push(Math.round(Number(price))); }
        if (description !== undefined) { fields.push(`description = $${idx++}`); params.push(description); }
        if (emoji !== undefined) { fields.push(`emoji = $${idx++}`); params.push(emoji); }
        if (is_available !== undefined) { fields.push(`is_available = $${idx++}`); params.push(is_available === 'true' || is_available === '1' || is_available === 1 || is_available === true); }
        if (hpp !== undefined) { fields.push(`hpp = $${idx++}`); params.push(Math.round(Number(hpp))); }
        if (hpp_type !== undefined) { fields.push(`hpp_type = $${idx++}`); params.push(hpp_type); }

        if (req.file) {
            const imageUrl = await uploadToCloudinary(req.file.buffer);
            fields.push(`image_url = $${idx++}`);
            params.push(imageUrl);
        }

        if (fields.length === 0) return res.json({ message: 'No changes' });
        params.push(req.params.id);
        await db.run(`UPDATE menu_items SET ${fields.join(', ')} WHERE id = $${idx}`, params);
        res.json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        const menuId = req.params.id;
        await db.run('DELETE FROM recipes WHERE menu_item_id = $1', [menuId]);
        await db.run('DELETE FROM order_items WHERE menu_item_id = $1', [menuId]);
        await db.run('DELETE FROM promotions WHERE buy_item_id = $1 OR get_item_id = $2', [menuId, menuId]);
        await db.run('DELETE FROM menu_items WHERE id = $1', [menuId]);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
