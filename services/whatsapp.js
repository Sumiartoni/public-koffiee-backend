
import axios from 'axios';

// GANTI TOKEN INI DENGAN TOKEN FONNTE ANDA
const FONNTE_TOKEN = process.env.FONNTE_TOKEN || 'YOUR_TOKEN_HERE';

export const sendWhatsApp = async (target, message) => {
    try {
        if (!target) return;

        console.log(`[WA] Sending to ${target}...`);

        const response = await axios.post('https://api.fonnte.com/send', {
            target: target,
            message: message,
        }, {
            headers: {
                'Authorization': FONNTE_TOKEN
            }
        });

        console.log(`[WA] Result: ${JSON.stringify(response.data)}`);
        return response.data;
    } catch (error) {
        console.error('[WA Error]', error.message);
    }
};

export const formatPaymentSuccess = (order) => {
    return `Halo kak *${order.customer_name}*! 👋\n\nPembayaran untuk pesanan *${order.order_number}* telah BERHASIL diverifikasi. ✅\n\nTotal: Rp ${order.final_amount}\n\nPesanan sedang disiapkan. Mohon ditunggu ya! ☕`;
};

export const formatNewOrder = (order) => {
    let itemsList = '';
    // If items are attached (need to ensure they are passed)
    if (order.items && order.items.length > 0) {
        itemsList = order.items.map(i => `- ${i.menu_item_name} x${i.quantity}`).join('\n');
    }

    return `Halo kak *${order.customer_name}*! 👋\n\nPesanan kamu *${order.order_number}* sudah kami terima dan sedang diproses. 🍳\n\nDetail Pesanan:\n${itemsList}\n\nTotal: Rp ${order.total}\n\nMohon menunggu sebentar ya! Terima kasih. 🙏`;
};
