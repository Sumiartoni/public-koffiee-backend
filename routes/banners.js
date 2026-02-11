import express from 'express';
import db from '../db.js';
import multer from 'multer';
import cloudinary from '../cloudinaryConfig.js';

const router = express.Router();

// Use memory storage for Cloudinary upload (no local file needed)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// Helper: upload buffer to Cloudinary
const uploadToCloudinary = (buffer, folder = 'banners') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: `public-koffiee/${folder}`, resource_type: 'image' },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        stream.end(buffer);
    });
};

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

    let image_url = null;
    if (req.file) {
        try {
            const result = await uploadToCloudinary(req.file.buffer);
            image_url = result.secure_url;
        } catch (err) {
            console.error('[CLOUDINARY UPLOAD ERROR]', err.message);
            return res.status(500).json({ error: 'Gagal upload gambar' });
        }
    }

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
        const current = (await db.query('SELECT * FROM app_banners WHERE id = $1', [id])).rows[0];
        if (!current) return res.status(404).json({ error: 'Banner tidak ditemukan' });

        let image_url = current.image_url;
        if (req.file) {
            try {
                // Delete old image from Cloudinary if exists
                if (current.image_url && current.image_url.includes('cloudinary')) {
                    const parts = current.image_url.split('/');
                    const publicId = parts.slice(-2).join('/').replace(/\.[^.]+$/, '');
                    await cloudinary.uploader.destroy(publicId).catch(() => { });
                }
                const result = await uploadToCloudinary(req.file.buffer);
                image_url = result.secure_url;
            } catch (err) {
                console.error('[CLOUDINARY UPLOAD ERROR]', err.message);
                return res.status(500).json({ error: 'Gagal upload gambar' });
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
        if (banner && banner.image_url && banner.image_url.includes('cloudinary')) {
            const parts = banner.image_url.split('/');
            const publicId = parts.slice(-2).join('/').replace(/\.[^.]+$/, '');
            await cloudinary.uploader.destroy(publicId).catch(() => { });
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
