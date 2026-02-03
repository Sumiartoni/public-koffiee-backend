
import QRCode from 'qrcode';
import db from '../db.js'; // Menggunakan koneksi DB yang sudah ada
import { convertToDynamicQRIS } from './lib/qris.js';
import { sendWhatsApp, formatPaymentSuccess } from '../../services/whatsapp.js';

// STATIC QRIS: String mentah QRIS Statis Anda (tanpa CRC di ujung atau lengkap full string)
// Untuk demo saya pakai dummy. GANTI DENGAN STRING QRIS STATIS ASLI ANDA.
// Cara dapatkan: Decode gambar QRIS Anda di https://zxing.org/w/decode.jspx
const MY_STATIC_QRIS = "00020101021126570011ID.DANA.WWW011893600915394190345302099419034530303UMI51440014ID.CO.QRIS.WWW0215ID10254153362920303UMI5204581353033605802ID5914Public Koffiee6015Kab. Trenggalek610566316630451C0";

// Generate Unique Code (3 digit: 001 - 999)
async function generateUniqueCode(nominal) {
    // Cari angka unik 1-999 yang belum dipakai di pesanan PENDING yang belum expired
    // Algoritma simple: Random 1-500, cek db.
    let unique = 0;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
        unique = Math.floor(Math.random() * 499) + 1; // 1 - 500

        // Cekapakah (Nominal + Unique) sudah ada yang pending?
        // Query cek orders where status='pending' and final_amount = (nominal + unique) and expires > now
        const check = await db.get(`
            SELECT id FROM orders 
            WHERE status IN ('pending', 'unpaid') 
            AND final_amount = $1
            AND payment_expires_at > CURRENT_TIMESTAMP
        `, [nominal + unique]);

        if (!check) isUnique = true;
        attempts++;
    }

    return unique;
}

export async function processQrisPayment(orderId) {
    try {
        const order = await db.get('SELECT * FROM orders WHERE id = $1', [orderId]);
        if (!order) throw new Error("Order not found");

        // 1. Generate Unique Code & Expiry
        const uniqueCode = await generateUniqueCode(order.total);
        const finalAmount = order.total + uniqueCode;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 Menit expire

        // 2. Generate Dynamic QRIS String
        const dynamicQrisString = convertToDynamicQRIS(MY_STATIC_QRIS, finalAmount);

        // 3. Generate QR Image
        const qrImage = await QRCode.toDataURL(dynamicQrisString);

        // 4. Update Order
        await db.run(`
            UPDATE orders 
            SET unique_code = $1, final_amount = $2, payment_expires_at = $3, payment_method = 'qris'
            WHERE id = $4
        `, [uniqueCode, finalAmount, expiresAt.toISOString(), orderId]);

        return {
            qris_string: dynamicQrisString,
            qris_image: qrImage,
            final_amount: finalAmount,
            unique_code: uniqueCode,
            expires_at: expiresAt
        };

    } catch (err) {
        console.error("QRIS Generation Error:", err);
        throw err;
    }
}

// Simulasi Check Pembayaran (Web Hook Receiver)
// Fungsi ini dipanggil oleh "Sistem Cek Mutasi" (external script) ketika ada dana masuk
export async function verifyPayment(amountReceived) {
    // Cari order dengan final_amount ini yang statusnya pending
    const order = await db.get(`
        SELECT * FROM orders 
        WHERE final_amount = $1 
        AND (status = 'pending' OR payment_status = 'pending' OR payment_status = 'unpaid')
    `, [amountReceived]);

    if (order) {
        // MATCH! Mark as paid
        await db.run(`
            UPDATE orders 
            SET status = 'completed', payment_status = 'paid', completed_at = CURRENT_TIMESTAMP 
            WHERE id = $1
        `, [order.id]);

        // Kirim Notifikasi WA Lunas
        if (order.customer_phone) {
            const msg = formatPaymentSuccess(order);
            await sendWhatsApp(order.customer_phone, msg);
        }

        return { success: true, orderId: order.id, orderNumber: order.order_number };
    }

    return { success: false, message: "No matching pending order found" };
}
