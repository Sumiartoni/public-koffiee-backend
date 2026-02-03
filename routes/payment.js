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
        console.log(`[PAYMENT CALLBACK] Raw Data:`, req.body);

        let { amount, description, message } = req.body;

        // 1. Smart Parsing: If amount is missing/invalid but 'message' exists (from MacroDroid/Forwarder)
        if (!amount && message) {
            console.log(`[PAYMENT PARSING] Extracting amount from message: "${message}"`);
            // Remove "Rp", dots, commas, and non-digits. Examples: "Rp. 7.404" -> "7404"
            const extracted = String(message).replace(/[^0-9]/g, '');
            if (extracted) {
                amount = Number(extracted);
                console.log(`[PAYMENT PARSING] Extracted Amount: ${amount}`);
            }
        }

        if (!amount) {
            console.warn(`[PAYMENT FAILED] Amount is required but missing.`);
            return res.status(400).json({ error: 'Amount is required' });
        }

        // Clean amount string to number just in case
        const amountClean = Number(String(amount).replace(/[^0-9]/g, ''));

        // Verify Payment (Match amount to UNPAID Order)
        const result = await verifyPayment(amountClean);

        if (result.success) {
            console.log(`[PAYMENT MATCH] Order ${result.orderNumber} PAID -> Status now PENDING (Waiting for POS)`);

            // Socket Broadcast -> Trigger POS Notification "New Order"
            // We emit 'new-order' because for the POS, this is effectively a new VALID order entering the queue
            const io = req.app.get('io');
            if (io) {
                io.emit('new-order', result.order); // Send full order object
                io.emit('order-updated', { id: result.orderId, status: 'pending', payment_status: 'paid' });
            }

            return res.json({ status: 'success', message: 'Payment verified', data: result });
        } else {
            console.log(`[PAYMENT IGNORED] No matching UNPAID order for amount ${amountClean}`);
            return res.status(404).json({ status: 'ignored', message: 'No matching order found' });
        }

    } catch (err) {
        console.error("[PAYMENT ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
