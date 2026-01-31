import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'public-koffiee-secret-2024';

// Authenticate token middleware
export function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Token tidak ditemukan' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token tidak valid atau kadaluarsa' });
    }
}

// Alias for backward compatibility
export const authMiddleware = authenticateToken;

// Admin only middleware
export function adminOnly(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Akses admin diperlukan' });
    }
    next();
}

// Admin or Manager middleware
export function managerOnly(req, res, next) {
    if (!['admin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Akses manager diperlukan' });
    }
    next();
}

// Optional auth - doesn't fail if no token
export function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
        } catch (error) {
            // Token invalid but continue anyway
            req.user = null;
        }
    } else {
        req.user = null;
    }
    next();
}

export { JWT_SECRET };
