import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'rahasiaku123';

// In-memory OTP store (username -> { code, expires })
const otpStore = {};

// Mock Login (Customer App - temporary until OTP)
router.post('/mock-login', async (req, res) => {
    const { phone, device_id, name, whatsapp, referral_code } = req.body;

    if (!phone || phone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: 'Nomor HP tidak valid' });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const cleanWhatsapp = whatsapp ? whatsapp.replace(/\D/g, '') : cleanPhone;
    const userName = name && name.trim() ? name.trim() : `Guest ${cleanPhone.slice(-4)}`;

    try {
        // Check if customer exists by phone
        let user = await db.get('SELECT * FROM users WHERE phone = $1', [cleanPhone]);
        let isNewUser = false;

        if (!user) {
            isNewUser = true;
            // Generate unique referral code for new user
            const userRefCode = 'PK' + Math.random().toString(36).substring(2, 8).toUpperCase();

            const result = await db.run(`
                INSERT INTO users (username, password, name, role, phone, is_verified, is_active, referral_code, referred_by)
                VALUES ($1, $2, $3, 'customer', $4, 1, 1, $5, $6)
                RETURNING id
            `, [
                `cust_${cleanPhone}`,
                'mock_no_password',
                userName,
                cleanWhatsapp,
                userRefCode,
                referral_code || null
            ]);

            const newId = (result.rows && result.rows[0]) ? result.rows[0].id : null;
            user = await db.get('SELECT * FROM users WHERE id = $1', [newId]);

            // Process referral if code provided
            if (referral_code && user) {
                try {
                    const referrer = await db.get(
                        'SELECT id FROM users WHERE referral_code = $1', [referral_code]
                    );
                    if (referrer && referrer.id !== user.id) {
                        // Check not already recorded
                        const existing = await db.get(
                            'SELECT id FROM referral_rewards WHERE referred_id = $1', [user.id]
                        );
                        if (!existing) {
                            await db.run(
                                'INSERT INTO referral_rewards (referrer_id, referred_id) VALUES ($1, $2)',
                                [referrer.id, user.id]
                            );
                            // Auto-grant referral rewards
                            const { checkReferralEligibility } = await import('./referrals.js');
                            await checkReferralEligibility(referrer.id);
                            console.log(`[AUTH] Referral processed: ${referral_code} -> user ${user.id}`);
                        }
                    }
                } catch (refErr) {
                    console.error('[AUTH] Referral processing error (non-fatal):', refErr.message);
                }
            }
        } else {
            // Update name if provided and different
            if (name && name.trim() && user.name !== userName) {
                await db.run('UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [userName, user.id]);
                user.name = userName;
            }
            // Backfill referral_code for existing users who don't have one
            if (!user.referral_code) {
                const userRefCode = 'PK' + Math.random().toString(36).substring(2, 8).toUpperCase();
                await db.run('UPDATE users SET referral_code = $1 WHERE id = $2', [userRefCode, user.id]);
                user.referral_code = userRefCode;
            }
        }

        const token = jwt.sign(
            { id: user.id, phone: cleanPhone, role: 'customer', device_id },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                phone: cleanPhone,
                whatsapp: user.phone,
                referral_code: user.referral_code || null,
                points: 0
            }
        });
    } catch (err) {
        console.error('[MOCK LOGIN ERROR]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await db.get('SELECT * FROM users WHERE username = $1 AND is_active = 1', [username]);

        if (!user) {
            return res.status(401).json({ error: 'Username tidak ditemukan' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Password salah' });
        }

        // Generate Token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                is_verified: user.is_verified
            }
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Server error saat login' });
    }
});

// Register
router.post('/register', async (req, res) => {
    const { username, password, name, phone } = req.body;

    try {
        const exists = await db.get('SELECT id FROM users WHERE username = $1', [username]);
        if (exists) return res.status(400).json({ error: 'Username sudah dipakai' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await db.run(`
            INSERT INTO users (username, password, name, role, phone, is_verified, is_active)
            VALUES ($1, $2, $3, 'admin', $4, 1, 1)
            RETURNING id
        `, [username, hashedPassword, name, phone]);

        const newId = (result.rows && result.rows[0]) ? result.rows[0].id : null;
        const user = await db.get('SELECT * FROM users WHERE id = $1', [newId]);

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'Registrasi Berhasil',
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                is_verified: 1
            }
        });
    } catch (err) {
        console.error('Register Error:', err);
        res.status(500).json({ error: 'Gagal membuat user' });
    }
});

// =============================================
// CUSTOMER OTP LOGIN (WhatsApp via Fonnte)
// =============================================

// POST /api/auth/request-otp
router.post('/request-otp', async (req, res) => {
    const { phone, device_id } = req.body;
    if (!phone || phone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: 'Nomor HP tidak valid' });
    }
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.substring(1);
    if (!cleanPhone.startsWith('62')) cleanPhone = '62' + cleanPhone;

    try {
        // Rate limit: max 3 OTP per number per 5 minutes
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const countByPhone = await db.get(
            `SELECT COUNT(*) as cnt FROM otp_codes WHERE phone = $1 AND created_at > $2`,
            [cleanPhone, fiveMinAgo]
        );
        if (parseInt(countByPhone.cnt) >= 3) {
            return res.status(429).json({ error: 'Terlalu banyak permintaan OTP. Tunggu 5 menit.' });
        }

        // Rate limit: max 5 OTP per device per 10 minutes
        if (device_id) {
            const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const countByDevice = await db.get(
                `SELECT COUNT(*) as cnt FROM otp_codes WHERE device_id = $1 AND created_at > $2`,
                [device_id, tenMinAgo]
            );
            if (parseInt(countByDevice.cnt) >= 5) {
                return res.status(429).json({ error: 'Terlalu banyak permintaan OTP dari perangkat ini.' });
            }
        }

        const { generateOtp, sendWhatsApp } = await import('../services/fonnte.js');
        const otpCode = generateOtp();
        const expiredAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

        await db.run(
            `INSERT INTO otp_codes (phone, otp_code, expired_at, device_id, request_ip) VALUES ($1, $2, $3, $4, $5)`,
            [cleanPhone, otpCode, expiredAt.toISOString(), device_id || null, ip]
        );

        const message = `🔐 *Public Koffiee*\n\nKode OTP Anda: *${otpCode}*\n\nBerlaku 5 menit. Jangan bagikan ke siapapun.`;
        await sendWhatsApp(cleanPhone, message);

        console.log(`[OTP] Sent to ${cleanPhone} (device: ${device_id})`);
        res.json({ success: true, message: 'OTP dikirim ke WhatsApp Anda' });
    } catch (err) {
        console.error('[REQUEST OTP ERROR]', err.message);
        res.status(500).json({ error: 'Gagal mengirim OTP: ' + err.message });
    }
});

// POST /api/auth/verify-otp (Customer Login)
router.post('/verify-otp', async (req, res) => {
    const { phone, otp_code, device_id, name, referral_code } = req.body;
    if (!phone || !otp_code) {
        return res.status(400).json({ error: 'phone dan otp_code wajib diisi' });
    }

    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.substring(1);
    if (!cleanPhone.startsWith('62')) cleanPhone = '62' + cleanPhone;

    const now = new Date().toISOString();
    console.log(`[VERIFY-OTP] Checking: ${cleanPhone} | Code: ${otp_code} | Now: ${now}`);

    try {
        // 1. Validate OTP
        const otpRecord = await db.get(
            `SELECT * FROM otp_codes 
             WHERE phone = $1 AND otp_code = $2 AND is_used = FALSE AND expired_at > $3
             ORDER BY created_at DESC LIMIT 1`,
            [cleanPhone, otp_code, now]
        );

        if (!otpRecord) {
            console.warn(`[VERIFY-OTP] Failed: No valid record found for ${cleanPhone} and ${otp_code}`);
            return res.status(400).json({ error: 'Kode OTP salah atau sudah kedaluarsa' });
        }

        // 2. Mark OTP used
        await db.run('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [otpRecord.id]);

        // 3. Upsert user
        const userName = name && name.trim() ? name.trim() : `Customer ${cleanPhone.slice(-4)}`;
        let user = await db.get('SELECT * FROM users WHERE phone = $1', [cleanPhone]);
        let isNewUser = false;

        if (!user) {
            isNewUser = true;
            const userRefCode = 'PK' + Math.random().toString(36).substring(2, 8).toUpperCase();
            const result = await db.run(`
                INSERT INTO users (username, password, name, role, phone, is_verified, is_active, referral_code, referred_by)
                VALUES ($1, $2, $3, 'customer', $4, 1, 1, $5, $6)
                RETURNING id
            `, [`cust_${cleanPhone}`, 'otp_no_password', userName, cleanPhone, userRefCode, referral_code || null]);

            const newId = result.rows?.[0]?.id;
            user = await db.get('SELECT * FROM users WHERE id = $1', [newId]);

            // Process referral
            if (referral_code && user) {
                try {
                    const referrer = await db.get('SELECT id FROM users WHERE referral_code = $1', [referral_code]);
                    if (referrer && referrer.id !== user.id) {
                        const existing = await db.get('SELECT id FROM referral_rewards WHERE referred_id = $1', [user.id]);
                        if (!existing) {
                            await db.run('INSERT INTO referral_rewards (referrer_id, referred_id) VALUES ($1, $2)', [referrer.id, user.id]);
                            const { checkReferralEligibility } = await import('./referrals.js');
                            await checkReferralEligibility(referrer.id);
                        }
                    }
                } catch (refErr) {
                    console.error('[VERIFY-OTP] Referral error (non-fatal):', refErr.message);
                }
            }
        } else {
            // Update name if provided
            if (name && name.trim() && user.name !== userName) {
                await db.run('UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [userName, user.id]);
                user.name = userName;
            }
            if (!user.referral_code) {
                const userRefCode = 'PK' + Math.random().toString(36).substring(2, 8).toUpperCase();
                await db.run('UPDATE users SET referral_code = $1 WHERE id = $2', [userRefCode, user.id]);
                user.referral_code = userRefCode;
            }
        }

        // 4. Soft device binding
        if (device_id) {
            const existingDevice = await db.get('SELECT * FROM user_devices WHERE device_id = $1', [device_id]).catch(() => null);
            if (!existingDevice) {
                await db.run(
                    'INSERT INTO user_devices (device_id, user_id) VALUES ($1, $2) ON CONFLICT (device_id) DO NOTHING',
                    [device_id, user.id]
                ).catch(() => null);
            } else {
                await db.run(
                    'UPDATE user_devices SET user_id = $1, last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE device_id = $2',
                    [user.id, device_id]
                ).catch(() => null);
            }
        }

        // 5. Generate JWT
        const token = jwt.sign(
            { id: user.id, phone: cleanPhone, role: 'customer', device_id: device_id || 'unknown' },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        // 6. Insert session
        const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await db.run(
            'INSERT INTO user_sessions (user_id, device_id, token, expired_at) VALUES ($1, $2, $3, $4)',
            [user.id, device_id || null, token, sessionExpiry.toISOString()]
        ).catch(() => null);

        console.log(`[VERIFY-OTP] Login ${isNewUser ? 'NEW' : 'existing'} user: ${user.name} (${cleanPhone})`);

        res.json({
            token,
            is_new_user: isNewUser,
            user: {
                id: user.id,
                name: user.name,
                phone: cleanPhone,
                referral_code: user.referral_code || null,
                points: user.points || 0,
            }
        });
    } catch (err) {
        console.error('[VERIFY OTP ERROR]', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// Send OTP (legacy Admin - for backoffice password reset)
router.post('/send-admin-otp', async (req, res) => {
    const { username } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[username] = { code, expires: Date.now() + 300000 };
    console.log(`[🔐 ADMIN OTP] ${username} -> ${code}`);
    res.json({ message: 'OTP terkirim', otp: code });
});

// Verify OTP (legacy Admin)
router.post('/verify-admin-otp', async (req, res) => {
    const { username, otp } = req.body;
    const record = otpStore[username];
    if (!record || record.code !== otp || Date.now() > record.expires) {
        return res.status(400).json({ error: 'Kode OTP Salah atau Kadaluarsa' });
    }
    try {
        await db.run('UPDATE users SET is_verified = 1 WHERE username = $1', [username]);
        delete otpStore[username];
        res.json({ message: 'Verifikasi Berhasil' });
    } catch (e) {
        res.status(500).json({ error: 'DB Error' });
    }
});


// Profile Me
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No auth header' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await db.get('SELECT id, username, name, role, phone, is_verified FROM users WHERE id = $1', [decoded.id]);
        if (!user) return res.status(401).json({ error: 'User not found' });
        res.json({ user });
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

router.get('/', async (req, res) => {
    const users = await db.all('SELECT id, username, name, role, phone, is_active, created_at FROM users');
    res.json({ users });
});

// GET Customer App Users (role = customer) with stats
router.get('/customers', async (req, res) => {
    try {
        const users = await db.all(`
            SELECT 
                u.id,
                u.name,
                u.phone,
                u.referral_code,
                u.created_at,
                COALESCE(u.points, 0) as points,
                COALESCE(o.order_count, 0) as order_count,
                COALESCE(o.total_spent, 0) as total_spent,
                o.last_order_at
            FROM users u
            LEFT JOIN (
                SELECT user_id, COUNT(*) as order_count, SUM(total) as total_spent, MAX(created_at) as last_order_at
                FROM orders
                WHERE status IN ('completed', 'picked_up')
                GROUP BY user_id
            ) o ON u.id = o.user_id
            WHERE u.role = 'customer'
            ORDER BY u.created_at DESC
        `);
        const total = users.length;
        const activeToday = users.filter(u => {
            if (!u.last_order_at) return false;
            const today = new Date().toISOString().slice(0, 10);
            return u.last_order_at.slice(0, 10) === today;
        }).length;
        res.json({ users, total, activeToday });
    } catch (err) {
        console.error('[CUSTOMERS ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
