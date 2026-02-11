import express from 'express';
import db from '../db.js';

const router = express.Router();

// POST /api/device/register
// Distribusi voucher pengguna baru berdasarkan device_id
router.post('/register', async (req, res) => {
    const { device_id } = req.body;

    if (!device_id || typeof device_id !== 'string' || device_id.trim().length === 0) {
        return res.status(400).json({ error: 'device_id wajib diisi' });
    }

    const trimmedDeviceId = device_id.trim();

    try {
        // 1. Cek device di user_devices
        const existingDevice = (await db.query(
            'SELECT * FROM user_devices WHERE device_id = $1',
            [trimmedDeviceId]
        )).rows[0];

        let isNewDevice = false;

        if (!existingDevice) {
            // Device baru → insert
            await db.query(
                'INSERT INTO user_devices (device_id) VALUES ($1)',
                [trimmedDeviceId]
            );
            isNewDevice = true;
            console.log(`[DEVICE] New device registered: ${trimmedDeviceId}`);
        } else {
            // Device sudah ada → update last_seen_at
            await db.query(
                'UPDATE user_devices SET last_seen_at = CURRENT_TIMESTAMP WHERE device_id = $1',
                [trimmedDeviceId]
            );
            console.log(`[DEVICE] Existing device updated: ${trimmedDeviceId}`);
        }

        // 2. Cek apakah device sudah punya voucher new_user
        const existingVoucher = (await db.query(
            `SELECT uv.* FROM user_vouchers uv
             JOIN customer_vouchers cv ON uv.voucher_id = cv.id
             WHERE uv.device_id = $1 AND cv.category = 'new_user'`,
            [trimmedDeviceId]
        )).rows[0];

        if (existingVoucher) {
            // Device sudah punya voucher new_user → jangan beri lagi
            console.log(`[DEVICE] Device ${trimmedDeviceId} already has new_user voucher`);
            return res.json({
                device_id: trimmedDeviceId,
                is_new: isNewDevice,
                voucher_given: false,
                message: 'Device sudah memiliki voucher pengguna baru'
            });
        }

        // 3. Ambil voucher master new_user yang aktif dan masih ada quota
        const voucher = (await db.query(
            `SELECT * FROM customer_vouchers 
             WHERE category = 'new_user' 
             AND is_active = TRUE 
             AND (quota IS NULL OR quota > 0)
             ORDER BY id ASC
             LIMIT 1`
        )).rows[0];

        if (!voucher) {
            console.log(`[DEVICE] No active new_user voucher available`);
            return res.json({
                device_id: trimmedDeviceId,
                is_new: isNewDevice,
                voucher_given: false,
                message: 'Tidak ada voucher pengguna baru yang tersedia'
            });
        }

        // 4. Calculate Expired At
        let expired_at = null;
        if (voucher.validity_days) {
            const date = new Date();
            date.setDate(date.getDate() + voucher.validity_days);
            expired_at = date.toISOString();
        }

        // 5. Insert voucher ke user_vouchers
        await db.query(
            `INSERT INTO user_vouchers (user_id, voucher_id, device_id, is_used, expired_at) 
             VALUES ($1, $2, $3, $4, $5)`,
            [null, voucher.id, trimmedDeviceId, false, expired_at]
        );

        // 6. Kurangi quota voucher
        if (voucher.quota !== null) {
            await db.query(
                'UPDATE customer_vouchers SET quota = quota - 1 WHERE id = $1',
                [voucher.id]
            );
        }

        console.log(`[DEVICE] Voucher "${voucher.title}" given to device ${trimmedDeviceId}`);

        return res.json({
            device_id: trimmedDeviceId,
            is_new: isNewDevice,
            voucher_given: true,
            voucher: {
                id: voucher.id,
                title: voucher.title,
                description: voucher.description,
                type: voucher.type,
                value: voucher.value,
                min_purchase: voucher.min_purchase,
                max_discount: voucher.max_discount
            }
        });

    } catch (error) {
        console.error('[DEVICE REGISTER ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
