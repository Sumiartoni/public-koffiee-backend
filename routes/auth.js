import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'rahasiaku123';

// In-memory OTP store (username -> { code, expires })
const otpStore = {};

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
