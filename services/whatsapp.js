
import axios from 'axios';

// GANTI TOKEN INI DENGAN TOKEN ASLI DARI FONNTE
const FONNTE_TOKEN = process.env.FONNTE_TOKEN || 'UUqCy6MARPx9jPpaMsAT';

export async function sendWhatsApp(target, message, mediaUrl = null) {
    try {
        if (!target) {
            console.warn('⚠️ No WhatsApp target phone number provided');
            return false;
        }

        /* 
         * Fonnte API Support
         * Docs: https://docs.fonnte.com/
         */
        const formData = new FormData();
        formData.append('target', target);
        formData.append('message', message);
        if (mediaUrl) {
            formData.append('url', mediaUrl);
        }

        // Optional: Add other Fonnte specific fields like 'typing', 'delay', etc if needed
        // formData.append('typing', true);
        // formData.append('delay', '2');

        console.log(`📤 Sending WhatsApp to ${target}...`);

        const response = await axios.post('https://api.fonnte.com/send', formData, {
            headers: {
                'Authorization': FONNTE_TOKEN,
                // FormData headers are automatically set by Axios in recent versions,
                // but explicit Content-Type header removal (letting axios set boundary) is safer
            }
        });

        console.log('✅ WhatsApp Sent:', response.data);
        return response.data;

    } catch (error) {
        console.error('❌ Failed to send WhatsApp:', error.response?.data || error.message);
        return false;
    }
}

export function formatOrderReceipt(order, items) {
    const date = new Date(order.created_at).toLocaleString('id-ID');
    const itemsList = items.map(item =>
        `- ${item.quantity}x ${item.menu_item_name} @${item.price.toLocaleString()}\n  ${item.notes || ''}`
    ).join('\n');

    const extraMessage = (order.payment_method === 'qris' && order.payment_status !== 'paid')
        ? `\n\n🔴 *PENTING:* Silakan selesaikan pembayaran dengan SCAN QRIS yang muncul pada layar kasir.`
        : '';

    return `
*STRUK PEMBAYARAN - PUBLIC KOFFIEE*
--------------------------------
No. Order: #${order.order_number}
Tanggal: ${date}
Pelanggan: ${order.customer_name || 'Guest'}
--------------------------------
*MENU:*
${itemsList}
--------------------------------
Subtotal: Rp ${order.subtotal.toLocaleString()}
${order.discount > 0 ? `Diskon: -Rp ${order.discount.toLocaleString()}\n` : ''}
*TOTAL: Rp ${order.total.toLocaleString()}*
--------------------------------
Metode: ${order.payment_method}
Admin: ${order.user_id ? 'Kasir' : 'Online'}
--------------------------------
_Terima kasih atas kunjungannya_
_Informasi Kritik Dan Saran_
_IG: @publickoffiee_${extraMessage}
`;
}

export function formatDeliveryNotification(order, items) {
    const itemsList = items.map(item => {
        const priceLabel = item.price === 0 ? ' (GRATIS/PROMO)' : '';
        return `- ${item.quantity}x ${item.menu_item_name}${priceLabel}`;
    }).join('\n');

    // Cek apakah alamat berupa link (sudah GPS) atau teks manual
    const isLink = order.customer_address && order.customer_address.startsWith('http');
    const addressDisplay = isLink ? order.customer_address : `${order.customer_address}\n_(Mohon Share Live Location/Serlok manual kesini agar kurir lebih mudah)_`;

    const extraMessage = (order.payment_method === 'qris' && order.payment_status !== 'paid')
        ? `\n\n🔴 *PENTING:* Silakan selesaikan pembayaran dengan SCAN QRIS yang muncul pada halaman web/aplikasi.`
        : '';

    return `
*PESANAN DITERIMA!* 🛵
Halo *${order.customer_name}*,

Pesanan *#${order.order_number}* sedang dipersiapkan.

*Metode:* Delivery
*Alamat:* ${addressDisplay}

*Pesanan:*
${itemsList}

Subtotal: Rp ${order.subtotal?.toLocaleString() || 0}
${order.discount > 0 ? `Diskon: -Rp ${order.discount.toLocaleString()}\n` : ''}*Total: Rp ${order.total.toLocaleString()}*

Mohon ditunggu, kurir kami akan segera mengantar pesanan Anda!${extraMessage}
`;
}

export function formatPickupNotification(order, items) {
    const itemsList = items.map(item => {
        const priceLabel = item.price === 0 ? ' (GRATIS/PROMO)' : '';
        return `- ${item.quantity}x ${item.menu_item_name}${priceLabel}`;
    }).join('\n');

    const extraMessage = (order.payment_method === 'qris' && order.payment_status !== 'paid')
        ? `\n\n🔴 *PENTING:* Silakan selesaikan pembayaran dengan SCAN QRIS yang muncul pada halaman web/aplikasi.`
        : '';

    return `
*PESANAN DITERIMA!* 🛍️
Halo *${order.customer_name}*,

Pesanan *#${order.order_number}* sedang dipersiapkan.

*Metode:* Pickup (Ambil Sendiri)
*Lokasi Toko:* Desa Gayam Kec Panggul Kab Trenggalek

*Pesanan:*
${itemsList}

Subtotal: Rp ${order.subtotal?.toLocaleString() || 0}
${order.discount > 0 ? `Diskon: -Rp ${order.discount.toLocaleString()}\n` : ''}*Total: Rp ${order.total.toLocaleString()}*

Kami akan mengabari Anda jika pesanan sudah siap diambil.${extraMessage}
`;
}

export function formatOrderReady(order) {
    const isDelivery = order.order_type === 'delivery';
    return `
*PESANAN SELESAI!* ✅
Halo *${order.customer_name}*,

Pesanan *#${order.order_number}* sudah ${isDelivery ? 'kami serahkan ke driver untuk pengantaran' : 'SIAP DIAMBIL'}.

${isDelivery ? 'Mohon pastikan Anda berada di lokasi penerimaan.' : 'Silakan datang ke kasir untuk pengambilan.'}

Terima kasih! ☕
`;
}

export function formatPaymentSuccess(order) {
    const date = new Date().toLocaleString('id-ID');
    return `
*PEMBAYARAN DITERIMA!* ✅
Halo *${order.customer_name}*,

Terima kasih! Pembayaran untuk pesanan *#${order.order_number}* sebesar *Rp ${order.final_amount.toLocaleString()}* (QRIS) telah kami terima dan diverifikasi.

Status: *LUNAS*
Waktu: ${date}

Pesanan Anda sedang kami proses. Mohon ditunggu! ☕
`;
}
