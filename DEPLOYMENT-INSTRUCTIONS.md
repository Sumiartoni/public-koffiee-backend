# 🚀 INSTRUKSI DEPLOYMENT POSTGRESQL KE SUPABASE

## LANGKAH 1: Jalankan Schema SQL di Supabase

1. **Buka Supabase Dashboard:**
   - Go to: https://supabase.com/dashboard
   - Pilih project: `coffee-pos`

2. **Buka SQL Editor:**
   - Di sidebar kiri, klik **"SQL Editor"**
   - Klik **"New query"**

3. **Copy-Paste Schema:**
   - Buka file: `backend/schema-postgresql.sql`
   - Copy **SEMUA ISI** file tersebut
   - Paste ke SQL Editor Supabase

4. **Jalankan Query:**
   - Klik tombol **"Run"** atau tekan `Ctrl + Enter`
   - **Tunggu hingga selesai** (~5-10 detik)
   - Kalau sukses, akan muncul pesan "Success. No rows returned"

5. **Verifikasi Tables:**
   - Di sidebar kiri, klik **"Table Editor"**
   - Pastikan ada table: users, menu_items, orders, categories, dll
   - Total harus ada **15 tables**

---

## LANGKAH 2: Test Koneksi Lokal

Setelah schema ter-create, jalankan command:

```bash
cd backend
npm run dev
```

**Jika berhasil, akan muncul:**
```
🔌 Database Mode: POSTGRES
🌐 Server    : http://0.0.0.0:3001
```

**Jika ada error:** Screenshot dan kirim ke saya

---

## LANGKAH 3: Test API dengan Browser/Postman

Buka browser:
```
http://localhost:3001/api/auth/
```

Harusnya return:
```json
{
  "users": [
    {
      "id": 1,
      "username": "admin",
      "name": "Administrator",
      "role": "admin"
    }
  ]
}
```

---

## TROUBLESHOOTING

### Error: "Connection Refused"
- Pastikan DATABASE_URL di `.env` sudah benar
- Pastikan Supabase project status "Active"

### Error: "relation does not exist"
- Schema belum dijalankan di Supabase
- Ulangi LANGKAH 1

### Error: "SSL required"
- Sudah di-handle di kode (ssl: { rejectUnauthorized: false })

---

**Silakan lakukan LANGKAH 1 terlebih dahulu, lalu lanjutkan ke LANGKAH 2**
