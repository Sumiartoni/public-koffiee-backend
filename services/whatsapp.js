import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Token Fonnte (Hardcoded sesuai request user untuk memastikan jalan)
const FONNTE_TOKEN = process.env.FONNTE_TOKEN || 'qcfyPyU2CUGh8TyGp28g';

const formatIDR = (num) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
};

export const sendWhatsApp = async (target, message) => {
    try {
        if (!target) return;

        let formattedTarget = String(target).trim();
        if (formattedTarget.startsWith('0')) formattedTarget = '62' + formattedTarget.slice(1);
        formattedTarget = formattedTarget.replace(/[^0-9]/g, '');

        if (!FONNTE_TOKEN) {
            console.warn('[WA] FONNTE_TOKEN missing');
        }

        console.log(`[WA] Sending to ${formattedTarget}...`);

        await axios.post('https://api.fonnte.com/send', {
            target: formattedTarget,
            message: message,
            countryCode: '62'
        }, {
            headers: { 'Authorization': FONNTE_TOKEN }
        });

    } catch (error) {
        console.error('[WA Error]', error.message);
    }
};

// ==========================================
// 1. NOTIFIKASI AWAL (Order Masuk / Menunggu Bayar)
// ==========================================
export const formatNewOrder = (order) => {
    // Cek jika ini adalah transaksi kasir offline (Walk-in / Dine-in langsung bayar)
    // Biasanya ditandai dengan payment_status = 'paid' saat order dibuat
    // Namun, biar aman, kita cek order_type atau flow callernya.
    // Jika caller spesifik minta "receipt", pakai formatWalkInReceipt.
    // Tapi di sini formatNewOrder adalah general entry point untuk "Order Baru".

    const isQris = (order.payment_method === 'qris' || order.payment_method === 'e-wallet');
    const type = (order.order_type || '').toLowerCase();

    let title = "🛒 PESANAN BARU";
    let subHeader = "Terima kasih sudah memesan!";
    let instruction = "Mohon tunggu konfirmasi selanjutnya.";

    // Skenario 1: Pesanan Delivery
    if (type.includes('delivery')) {
        title = "🛵 PESANAN DELIVERY";
        subHeader = "Pesanan Delivery Anda Telah Kami Terima";
        instruction = "Pesanan sedang diproses. Kurir akan segera mengantar ke lokasi Anda.\n📍 Alamat: " + (order.customer_address || '-');
    }
    // Skenario 2: Pickup
    else if (type.includes('pickup')) {
        title = "🛍️ PESANAN PICKUP";
        subHeader = "Pesanan Pickup Anda Telah Kami Terima";
        instruction = "Pesanan sedang disiapkan. Kami akan mengabari saat pesanan SIAP diambil.";
    }

    // Skenario: Pembayaran QRIS (Belum Lunas) -> Minta Bayar
    if (isQris && order.payment_status === 'unpaid') {
        title = "💳 MENUNGGU PEMBAYARAN";
        let action = "agar pesanan dapat segera diproses.";
        if (type.includes('delivery')) {
            action = "agar pesanan dapat segera diproses dan dikirim ke:\n📍 " + (order.customer_address || '-');
        } else if (type.includes('pickup')) {
            action = "agar pesanan dapat segera disiapkan untuk diambil.";
        }

        // MOVED TO TOP (SUBHEADER) as per request
        subHeader = `⚠️ *MOHON SEGERA BAYAR*\n\nSilakan lakukan pembayaran via Scan QRIS ${action}`;
        instruction = "Setelah pembayaran berhasil, Anda akan menerima notifikasi konfirmasi otomatis.";
    }

    // Format List Menu Lebih Cantik
    const itemsList = (order.items || []).map(item => {
        const totalHargaItem = item.price * item.quantity;
        let note = item.notes ? `\n   _${item.notes}_` : '';

        // Parse Extras
        let extrasStr = '';
        try {
            if (item.extras) {
                const parsed = typeof item.extras === 'string' ? JSON.parse(item.extras) : item.extras;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    extrasStr = '\n   + ' + parsed.map(e => e.name).join(', ');
                }
            }
        } catch (e) { }

        return `• *${item.menu_item_name || item.name}* x${item.quantity}\n   Rp ${new Intl.NumberFormat('id-ID').format(totalHargaItem)}${extrasStr}${note}`;
    }).join('\n');


    // Kalimat Penutup Manis (Sweet Footer)
    const sweetFooter = "Terima kasih telah mempercayakan kopimu pada kami. Setiap cangkir dibuat dengan hati untuk hari-harimu yang berarti. ☕❤️\n\nJangan lupa tag kami di story ya! ✨";

    return `
*${title}*
${subHeader}

Halo Kak *${order.customer_name}*,
No. Order: *${order.order_number}*

📝 *Detail Pesanan:*
--------------------------------
${itemsList}
--------------------------------
💰 *Total Tagihan: ${formatIDR(order.final_amount || order.total)}*
💳 *Metode:* ${order.payment_method.toUpperCase()}
--------------------------------

${instruction}

${sweetFooter}

_Public Koffiee_
`.trim();
};

// ==========================================
// 2. NOTIFIKASI PEMBAYARAN SUKSES (QRIS)
// ==========================================
export const formatPaymentSuccess = (order) => {
    return `
*✅ PEMBAYARAN BERHASIL (LUNAS)*

Halo Kak *${order.customer_name}*,
Pembayaran QRIS untuk pesanan *${order.order_number}* sebesar *${formatIDR(order.final_amount || order.total)}* telah kami terima.

Pesanan sedang langsung diproses oleh tim kami! 🍳☕

_Public Koffiee_
`.trim();
};

// ==========================================
// 3. NOTIFIKASI PESANAN SIAP (KHUSUS PICKUP)
// ==========================================
// ==========================================
// 3. NOTIFIKASI PESANAN SELESAI (PICKUP / DELIVERY)
// ==========================================
export const formatOrderReady = (order) => {
    const type = (order.order_type || '').toLowerCase();

    let title = "🔔 PESANAN SIAP DIAMBIL!";
    let body = `Pesanan *${order.order_number}* (Pickup) sudah selesai disiapkan.\nSilakan ambil pesanan kakak di meja Pickup / Barista sekarang ya. 🏃💨`;

    if (type.includes('delivery')) {
        title = "🛵 PESANAN SEDANG DIANTAR!";
        body = `Pesanan *${order.order_number}* (Delivery) sudah selesai diproses dan sedang dibawa kurir ke alamat tujuan.\n\nMohon pastikan nomor HP aktif ya! 📦`;
    }

    return `
*${title}*

Halo Kak *${order.customer_name}*,

${body}

Selamat menikmati! ☕
_Public Koffiee_
`.trim();
};

// ==========================================
// Ektra: Struk
// ==========================================
export const formatWalkInReceipt = (order) => {
    const itemsList = (order.items || []).map(item => {
        let extrasStr = '';
        try {
            if (item.extras) {
                const parsed = typeof item.extras === 'string' ? JSON.parse(item.extras) : item.extras;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    extrasStr = ' (+ ' + parsed.map(e => e.name).join(', ') + ')';
                }
            }
        } catch (e) { }

        return `• ${item.menu_item_name || item.name} x${item.quantity}${extrasStr} (${formatIDR(item.price * item.quantity)})`;
    }).join('\n');

    return `
*🧾 STRUK DIGITAL - PUBLIC KOFFIEE*
No: ${order.order_number}
--------------------------------
${itemsList}
--------------------------------
Total: ${formatIDR(order.total)}
Status: LUNAS ✅

Terima kasih sudah mampir! 👋
`.trim();
};
