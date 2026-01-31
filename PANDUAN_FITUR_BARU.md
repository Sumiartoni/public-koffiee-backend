
# 🚀 PANDUAN FITUR BARU KASIR & WHATSAPP

Berikut adalah panduan untuk fitur-fitur baru yang telah ditambahkan ke sistem POS Anda.

## 1. Setup WhatsApp (Fonnte API)
Agar notifikasi WhatsApp berjalan, Anda perlu mendaftar di [Fonnte.com](https://fonnte.com/) (Gratis).

**Langkah-langkah:**
1. Daftar dan login di Fonnte.
2. Scan QR Code WA di dashboard Fonnte.
3. Copy **Token API** Anda.
4. Buka file `.env` di folder `coffee-pos/backend/` (buat jika belum ada).
5. Tambahkan baris ini:
   ```env
   FONNTE_TOKEN=Isi_Token_Fonnte_Anda_Disini
   ```
6. Restart server backend (`Ctrl+C` lalu `npm start`).

**Fitur Otomatis WA:**
- **Order Masuk (Online):** Mengirim detail pesanan ke pelanggan.
- **Pay Later Lunas:** Mengirim struk pembayaran saat kasir menyelesaikan order pay-later.
- **Order Selesai:** Mengirim notifikasi "Pesanan Siap" atau "Pesanan Diantar".

## 2. Fitur Website Pelanggan (Public)
Pelanggan sekarang bisa memilih metode:
- **🛍️ Pickup (Ambil Sendiri):** Tidak perlu isi alamat, lokasi toko ditampilkan.
- **🛵 Delivery (Diantar):** Wajib isi alamat, ada tombol bantuan Cek Maps.

## 3. Fitur Mobile POS
- **Notifikasi Order Masuk:** 
  - Akan muncul label **PICKUP** atau **DELIVERY**.
  - Jika Delivery, akan muncul tombol **BUKA GOOGLE MAPS** untuk melihat lokasi pengiriman.
- **Bayar Nanti (Pay Later):**
  - Di menu Kasir saat checkout, pilih opsi pembayaran **Bayar Nanti**.
  - Order akan tersimpan dengan status 'Belum Bayar' (Unpaid).
  - Anda bisa melunasinya nanti melalui menu Notifikasi -> Konfirmasi & Selesaikan.

---
*Semua sistem sudah terintegrasi. Selamat berjualan!* ☕
