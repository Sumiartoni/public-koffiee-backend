import express from 'express';
import db from '../db.js';

const router = express.Router();

// ============================================
// HAVERSINE FORMULA
// ============================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

/**
 * Calculate delivery fee based on distance and settings
 * @param {number} distanceKm - Distance in kilometers
 * @param {object} settings - Delivery settings from DB
 * @returns {object} { fee, breakdown }
 */
function calculateDeliveryFee(distanceKm, settings) {
    const baseFee = parseInt(settings.delivery_base_fee || '5000');
    const perKm = parseInt(settings.delivery_per_km || '3000');
    const freeKm = parseFloat(settings.delivery_free_km || '1');
    const maxKm = parseFloat(settings.delivery_max_km || '15');

    if (distanceKm > maxKm) {
        return {
            fee: -1, // Indicates out of range
            breakdown: {
                distance_km: Math.round(distanceKm * 100) / 100,
                max_km: maxKm,
                message: `Jarak pengiriman melebihi batas maksimal ${maxKm} km`
            }
        };
    }

    let fee = 0;
    let distanceFee = 0;

    if (distanceKm > freeKm) {
        const chargeableKm = distanceKm - freeKm;
        distanceFee = Math.ceil(chargeableKm) * perKm;
        fee = baseFee + distanceFee;
    }
    // Within free km = free delivery

    return {
        fee: Math.round(fee),
        breakdown: {
            distance_km: Math.round(distanceKm * 100) / 100,
            free_km: freeKm,
            base_fee: fee > 0 ? baseFee : 0,
            distance_fee: distanceFee,
            per_km: perKm,
            total_fee: Math.round(fee)
        }
    };
}

// ============================================
// GET DELIVERY SETTINGS
// ============================================
async function getDeliverySettings() {
    const keys = [
        'store_lat', 'store_lng',
        'delivery_base_fee', 'delivery_per_km',
        'delivery_max_km', 'delivery_free_km'
    ];

    const settings = {};
    for (const key of keys) {
        const row = await db.get('SELECT value FROM settings WHERE key = $1', [key]);
        settings[key] = row ? row.value : null;
    }

    return settings;
}

// ============================================
// POST: Calculate Delivery Fee (Preview)
// ============================================
router.post('/calculate', async (req, res) => {
    const { lat, lng } = req.body;

    if (!lat || !lng) {
        return res.status(400).json({ error: 'Latitude dan longitude harus diisi' });
    }

    const customerLat = parseFloat(lat);
    const customerLng = parseFloat(lng);

    if (isNaN(customerLat) || isNaN(customerLng)) {
        return res.status(400).json({ error: 'Koordinat tidak valid' });
    }

    try {
        const settings = await getDeliverySettings();

        if (!settings.store_lat || !settings.store_lng) {
            return res.status(500).json({
                error: 'Koordinat toko belum dikonfigurasi. Silakan atur store_lat dan store_lng di Settings.'
            });
        }

        const storeLat = parseFloat(settings.store_lat);
        const storeLng = parseFloat(settings.store_lng);

        const distance = haversineDistance(storeLat, storeLng, customerLat, customerLng);
        const result = calculateDeliveryFee(distance, settings);

        if (result.fee === -1) {
            return res.status(400).json({
                error: result.breakdown.message,
                distance_km: result.breakdown.distance_km,
                max_km: result.breakdown.max_km
            });
        }

        res.json({
            distance_km: result.breakdown.distance_km,
            delivery_fee: result.fee,
            breakdown: result.breakdown
        });

    } catch (err) {
        console.error('[DELIVERY CALC ERROR]', err);
        res.status(500).json({ error: 'Gagal menghitung ongkir', detail: err.message });
    }
});

// ============================================
// GET: Delivery Settings (for Flutter config)
// ============================================
router.get('/settings', async (req, res) => {
    try {
        const settings = await getDeliverySettings();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export utilities for use in order.js
export { haversineDistance, calculateDeliveryFee, getDeliverySettings };
export default router;
