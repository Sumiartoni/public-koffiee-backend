import express from 'express';
import db from '../db.js';
import multer from 'multer';
import { join, extname, dirname } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UPLOADS_DIR = join(__dirname, '..', 'uploads');

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const bannerDir = join(UPLOADS_DIR, 'banners');
        if (!fs.existsSync(bannerDir)) fs.mkdirSync(bannerDir, { recursive: true });
        cb(null, bannerDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'banner-' + uniqueSuffix + extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

// =============================================
// PUBLIC: Get active banners
// =============================================
router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM app_banners WHERE is_active = TRUE ORDER BY sort_order ASC, created_at DESC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// ADMIN: CRUD Banners
// =============================================

// GET all banners (admin)
router.get('/admin', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM app_banners ORDER BY sort_order ASC, created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CREATE banner
router.post('/', upload.single('image'), async (req, res) => {
    const { title, link_type, link_value, sort_order } = req.body;

    if (!title) return res.status(400).json({ error: 'Judul banner wajib diisi' });

    const image_url = req.file ? `/uploads/banners/${req.file.filename}` : null;

    try {
        const result = await db.query(
            `INSERT INTO app_banners (title, image_url, link_type, link_value, sort_order)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [title, image_url, link_type || 'none', link_value || null, parseInt(sort_order) || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// UPDATE banner
router.put('/:id', upload.single('image'), async (req, res) => {
    const { id } = req.params;
    const { title, link_type, link_value, sort_order, is_active } = req.body;

    try {
        // Get current banner for old image cleanup
        const current = (await db.query('SELECT * FROM app_banners WHERE id = $1', [id])).rows[0];
        if (!current) return res.status(404).json({ error: 'Banner tidak ditemukan' });

        let image_url = current.image_url;
        if (req.file) {
            image_url = `/uploads/banners/${req.file.filename}`;
            // Delete old image
            if (current.image_url) {
                const oldPath = join(__dirname, '..', current.image_url);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
        }

        const result = await db.query(
            `UPDATE app_banners 
             SET title=$1, image_url=$2, link_type=$3, link_value=$4, sort_order=$5, is_active=$6, updated_at=CURRENT_TIMESTAMP
             WHERE id=$7 RETURNING *`,
            [title, image_url, link_type || 'none', link_value || null, parseInt(sort_order) || 0, is_active !== undefined ? is_active : current.is_active, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE banner
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const banner = (await db.query('SELECT * FROM app_banners WHERE id = $1', [id])).rows[0];
        if (banner && banner.image_url) {
            const imgPath = join(__dirname, '..', banner.image_url);
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }
        await db.query('DELETE FROM app_banners WHERE id = $1', [id]);
        res.json({ message: 'Banner deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// TOGGLE active/inactive
router.patch('/:id/toggle', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            `UPDATE app_banners SET is_active = NOT is_active, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,
            [id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
