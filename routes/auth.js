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

// Send OTP
router.post('/send-otp', async (req, res) => {
    const { username } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[username] = { code, expires: Date.now() + 300000 };
    console.log(`[🔐 KODE OTP] ${username} -> ${code}`);
    res.json({ message: 'OTP terkirim ke email', otp: code });
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
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

export default router;
