
import express from 'express';
import { verifyPayment } from '../services/payment/index.js';

const router = express.Router();

// WEBHOOK / CALLBACK Endpoint
// Dipanggil oleh 3rd party mutation checker atau script checking Anda
// POST /api/payment/callback
// Body: { "amount": 50123, "description": "TRF dr ..." }
router.post('/callback', async (req, res) => {
    // Mendukung format JSON standar { amount: 1000 }
    // ATAU format forwarder { message: "Terima uang Rp 50.123 dari..." }
    let { amount, message, text, body } = req.body;

    // 1. Parsing Logika (Notification Forwarder biasanya kirim text/message)
    const rawText = message || text || body || '';

    if (!amount && rawText) {
        console.log(`[PAYMENT WEBHOOK] Raw Text received: "${rawText}"`);

        // Regex untuk mencari angka format rupiah (misal: 50.123 atau 50123)
        // Strategi: Cari angka yang mungkin merupakan nominal unik
        const match = rawText.match(/Rp\s?([\d\.]+)/i);
        if (match && match[1]) {
            // Hapus titik/koma
            amount = parseInt(match[1].replace(/\./g, '').replace(/,/g, ''));
        }
    }

    if (!amount) return res.status(400).json({ error: 'Amount checking failed. No amount detected.' });

    console.log(`[PAYMENT CHECK] Verifying amount: ${amount}`);

    try {
        const result = await verifyPayment(Number(amount));

        if (result.success) {
            console.log(`[PAYMENT SUCCESS] Order matched: ${result.orderNumber}`);
            return res.json({ status: 'ok', message: 'Payment verified', order: result.orderNumber });
        } else {
            console.log(`[PAYMENT IGNORED] No matching pending order for amount: ${amount}`);
            return res.status(404).json({ status: 'miss', message: result.message });
        }
    } catch (err) {
        console.error("[PAYMENT ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

// STATUS CHECK Endpoint (untuk frontend polling jika pakai polling)
// GET /api/payment/status/:orderId
//router.get('/status/:orderId', async (req, res) => { ... });

import QRCode from 'qrcode';

// ... (existing imports)

// RENDER QRIS IMAGE ENDPOINT (Untuk WA)
// GET /api/payment/render?data=0002...
router.get('/render', async (req, res) => {
    const { data } = req.query;
    if (!data) return res.status(400).send('Missing QRIS data');

    try {
        // Render as PNG Buffer
        const qrBuffer = await QRCode.toBuffer(data);

        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': qrBuffer.length
        });
        res.end(qrBuffer);
    } catch (err) {
        console.error("QR Render Error:", err);
        res.status(500).send("Error rendering QR");
    }
});

export default router;
