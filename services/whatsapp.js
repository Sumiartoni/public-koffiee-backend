import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;

// Helper: Format Currency Indonesia
const formatIDR = (num) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
};

/**
 * Mengirim pesan WhatsApp via Fonnte
 * @param {string} target - Nomor HP Tujuan (08xx atau 62xx)
 * @param {string} message - Isi Pesan
 */
export const sendWhatsApp = async (target, message) => {
    try {
        if (!target) {
            console.warn('[WA] No target phone number provided, skipping.');
            return;
        }

        // Sanitasi nomor HP (convert 08xxx -> 628xxx)
        let formattedTarget = String(target).trim();
        if (formattedTarget.startsWith('0')) {
            formattedTarget = '62' + formattedTarget.slice(1);
        }

        // Remove symbols like +, -
        formattedTarget = formattedTarget.replace(/[^0-9]/g, '');

        if (!FONNTE_TOKEN) {
            console.warn('[WA] FONNTE_TOKEN is missing in .env environment variables.');
            // Lanjut saja, siapa tahu user setting level global, tapi warning is good.
        }

        console.log(`[WA] Sending message to ${formattedTarget}...`);

        const response = await axios.post('https://api.fonnte.com/send', {
            target: formattedTarget,
            message: message,
            countryCode: '62' // Optional if target is handled correctly
        }, {
            headers: {
                'Authorization': FONNTE_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        // Fonnte biasanya return { status: true, ... }
        if (response.data.status) {
            console.log(`[WA] Success sending to ${formattedTarget}`);
        } else {
            console.error(`[WA] Failed response: ${JSON.stringify(response.data)}`);
        }

        return response.data;
    } catch (error) {
        console.error('[WA Error] Network/API Error:', error.response ? error.response.data : error.message);
        return null;
    }
};

// ==========================================
// TEMPLATES PESAN WHATSAPP (PUBLIC KOFFIEE)
// ==========================================

export const formatNewOrder = (order) => {
    // Pastikan items ada
    const items = order.items || [];

    // Format list item
    const itemsList = items.map(item => {
        let details = [];
        if (item.notes) details.push(`_${item.notes}_`);
        if (item.extras) details.push(`+ ${item.extras}`);

        const detailStr = details.length > 0 ? `\n   ${details.join(' ')}` : '';
        const priceStr = formatIDR(item.price * item.quantity);

        return `• *${item.menu_item_name}* ${item.quantity}x (${priceStr})${detailStr}`;
    }).join('\n');

    const paymentStatusIcon = order.payment_status === 'paid' ? 'LUNAS ✅' : 'BELUM LUNAS ⏳';

    return `
*👋 Halo Kak ${order.customer_name || 'Pelanggan'}!*

Pesanan kamu sudah kami terima dan sedang disiapkan oleh Barista. ☕✨

📦 *Detail Pesanan:*
No. Order: *${order.order_number}*
Status: *${paymentStatusIcon}*
----------------------------------------
${itemsList}
----------------------------------------
💰 *Total: ${formatIDR(order.total)}*

Mohon ditunggu sebentar ya kak! Kami akan segera mengantar/memanggil pesanan kakak.

_Public Koffiee_
`.trim();
};

export const formatPaymentSuccess = (order) => {
    return `
*✅ PEMBAYARAN BERHASIL*

Halo Kak *${order.customer_name || 'Pelanggan'}*,
Pembayaran untuk pesanan *${order.order_number}* sebesar *${formatIDR(order.final_amount || order.total)}* telah berhasil diverifikasi.

Terima kasih sudah menyelesaikan pembayaran. Pesanan kakak segera kami proses! 🚀

_Public Koffiee_
`.trim();
};

export const formatOrderReady = (order) => {
    return `
*🔔 PESANAN SIAP!*

Halo Kak *${order.customer_name || 'Pelanggan'}*,

Pesanan *${order.order_number}* sudah selesai disiapkan! 
Silakan ambil pesanan kakak di meja Pickup / Barista ya. 🏃💨

Selamat menikmati! ☕
_Public Koffiee_
`.trim();
};

export const formatOrderCompleted = (order) => {
    return `
*🙏 TERIMA KASIH*

Kak *${order.customer_name || 'Pelanggan'}*, terima kasih sudah mampir di Public Koffiee hari ini.
Semoga kopi dan layanan kami bikin harimu lebih semangat! ✨

Ditunggu kedatangannya kembali ya! 👋
`.trim();
};

export const formatOrderCancelled = (order) => {
    return `
*🚫 PESANAN DIBATALKAN*

Halo Kak *${order.customer_name}*,
Mohon maaf, pesanan *${order.order_number}* telah dibatalkan.

📝 Alasan: ${order.notes || order.void_reason || 'Pembatalan Sistem/Admin'}

Jika ada kesalahan atau kakak sudah melakukan pembayaran, silakan hubungi kasir kami untuk bantuan.
Terima kasih.
`.trim();
};
