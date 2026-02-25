// services/fonnte.js — WhatsApp OTP sender via Fonnte API

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;

/**
 * Send a WhatsApp message via Fonnte
 * @param {string} phone - Phone number (e.g. "628123456789")
 * @param {string} message - Message body
 */
export async function sendWhatsApp(phone, message) {
    if (!FONNTE_TOKEN) {
        console.error('[FONNTE] FONNTE_TOKEN not set in environment');
        throw new Error('WhatsApp service not configured');
    }

    // Normalize phone: must start with country code (62 for Indonesia)
    let normalized = phone.replace(/\D/g, '');
    if (normalized.startsWith('0')) normalized = '62' + normalized.substring(1);
    if (!normalized.startsWith('62')) normalized = '62' + normalized;

    const formData = new URLSearchParams();
    formData.append('target', normalized);
    formData.append('message', message);
    formData.append('countryCode', '62');

    const response = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
            Authorization: FONNTE_TOKEN,
        },
        body: formData,
    });

    const result = await response.json();
    if (!result.status) {
        console.error('[FONNTE] Send failed:', result);
        throw new Error(`WhatsApp send failed: ${result.reason || 'Unknown error'}`);
    }

    console.log(`[FONNTE] OTP sent to ${normalized}`);
    return result;
}

/**
 * Generate a random 6-digit OTP
 */
export function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
