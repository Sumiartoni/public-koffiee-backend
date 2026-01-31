
/**
 * QRIS CRC16-CCITT Implementation (Polynomial 0x1021)
 * Used to sign the QRIS string as per EMVCo standard.
 */
function crc16ccitt(data) {
    let crc = 0xFFFF;
    const polynomial = 0x1021;

    for (let i = 0; i < data.length; i++) {
        let byte = data.charCodeAt(i);
        crc ^= (byte << 8);
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = (crc << 1) ^ polynomial;
            } else {
                crc = crc << 1;
            }
        }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Convert Static QRIS to Dynamic QRIS by injecting Transaction Amount
 * @param {string} staticQris - The raw string of your static QRIS
 * @param {number} amount - The transaction amount (e.g. 27137)
 * @returns {string} - New dynamic QRIS string
 */
export function convertToDynamicQRIS(staticQris, amount) {
    // 1. Validasi awal
    if (!staticQris || !staticQris.startsWith('00')) {
        throw new Error("Invalid QRIS String");
    }

    // 2. Strip CRC lama (4 karakter terakhir) + Tag ID CRC '63' + Panjang '04'
    // Format QRIS diakhiri dengan tag '6304' lalu 4 char CRC.
    // Kita cari posisi '6304' di akhir string sebelum CRC.

    // Cara aman: Hapus 4 char terakhir dulu (CRC value lama)
    let raw = staticQris.slice(0, -4);

    // Cek apakah diakhiri '6304', jika ya hapus juga biar kita generate ulang nanti
    if (raw.endsWith('6304')) {
        raw = raw.slice(0, -4);
    }

    // 3. Inject Tag 54 (Transaction Amount)
    // Format: 54 + Length (2 chars) + Value
    const amountStr = amount.toString();
    const amountLen = amountStr.length.toString().padStart(2, '0');
    const tag54 = `54${amountLen}${amountStr}`;

    // Tag 58 adalah Country Code, biasanya setelah Transaction Currency (53).
    // Kita selipkan Tag 54 sebelum Tag 58 (atau 55/53 jika urutan beda, tapi standard EMVCo usually ordered).
    // Tapi replace paling aman jika Tag 54 sudah ada (QRIS Dinamis lama).

    // Cek apakah Tag 54 sudah ada?
    // Logika parsing sederhana: Loop TLV
    let i = 0;
    let newQrisParts = '';
    let found54 = false;

    // Kita rebuild stringnya
    while (i < raw.length) {
        const id = raw.substr(i, 2);
        const lenStr = raw.substr(i + 2, 2);
        const len = parseInt(lenStr, 10);
        const value = raw.substr(i + 4, len);

        if (id === '54') {
            // Skip existing amount, we will insert ours manually later logic or replace here
            // Kita replace langsung
            found54 = true;
            newQrisParts += tag54;
        } else if (id === '58' && !found54) {
            // Jika ketemu Tag 58 (Country) dan belum ketemu 54, selipkan 54 disini (Best Practice urutan)
            newQrisParts += tag54;
            found54 = true;
            newQrisParts += id + lenStr + value;
        } else {
            newQrisParts += id + lenStr + value;
        }

        i += 4 + len;
    }

    // Jika sampai akhir belum ketemu Tag 54 dan belum diselipkan (e.g. gak ada Tag 58?)
    if (!found54) {
        // Selipkan sebelum Tag 62 (Additional Data) atau append di akhir data utama
        // Amannya inject sebelum Tag 58/59/60 atau pas di 53 (Currency)
        // Fallback: Append di akhir section data (sebelum 63)
        newQrisParts += tag54;
    }

    // 4. Tambahkan Tag 02 (Point of Initiation Method) -> 12 (Dynamic) jika masih 11 (Static)
    // Tag 01: '010211' (Static) -> '010212' (Dynamic)
    // Biasanya ini di awal string.
    newQrisParts = newQrisParts.replace('010211', '010212');

    // 5. Append Tag 63 + Length '04'
    const finalPayload = newQrisParts + '6304';

    // 6. Calculate New CRC
    const newCrc = crc16ccitt(finalPayload);

    return finalPayload + newCrc;
}
