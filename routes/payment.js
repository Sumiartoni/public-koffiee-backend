import express from 'express';
import { verifyPayment } from '../services/payment/index.js'; // Adjust path if needed

const router = express.Router();

/**
 * WEBHOOK / CALLBACK - QRIS Payment Notification
 * Called by external system (e.g. Android app notifications listener)
 * Expected payload: { amount: 12500, description: "QRIS..." }
 */
router.post('/callback', async (req, res) => {
    try {
        console.log(`[PAYMENT CALLBACK] Data received:`, req.body);

        const { amount, description } = req.body;

        if (!amount) {
            return res.status(400).json({ error: 'Amount is required' });
        }

        // Clean amount string to number if needed
        const amountClean = Number(String(amount).replace(/[^0-9]/g, ''));

        // Verify Payment (Match amount to Pending Order)
        const result = await verifyPayment(amountClean);

        if (result.success) {
            console.log(`[PAYMENT MATCH] Order ${result.orderNumber} PAID!`);

            // Socket Broadcast (Optional if not handled in verifyPayment service)
            const io = req.app.get('io');
            if (io) {
                io.emit('order-updated', { id: result.orderId, status: 'completed', payment_status: 'paid' });
            }

            return res.json({ status: 'success', message: 'Payment verified', data: result });
        } else {
            console.log(`[PAYMENT IGNORED] No matching pending order for amount ${amountClean}`);
            return res.status(404).json({ status: 'ignored', message: 'No matching order found' });
        }

    } catch (err) {
        console.error("[PAYMENT ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
