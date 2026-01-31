# 🚀 CARA PUSH BACKEND KE GITHUB & DEPLOY KE KOYEB

## BAGIAN 1: Upload Code ke GitHub

Buka terminal di folder `backend`, lalu jalankan perintah berikut satu per satu:

1. **Inisialisasi Git:**
   ```bash
   git init
   ```

2. **Stage semua file:**
   ```bash
   git add .
   ```

3. **Commit perubahan:**
   ```bash
   git commit -m "Initial commit Backend Coffee POS"
   ```

4. **Buat Repository di GitHub:**
   - Buka browser: https://github.com/new
   - Nama Repository: `coffee-pos-backend`
   - Visibility: **Public** (agar mudah dideploy di Koyeb Free)
   - Klik **Create repository**

5. **Hubungkan & Push (Ganti URL dengan milik Anda):**
   ```bash
   git branch -M main
   git remote add origin https://github.com/[USERNAME_ANDA]/coffee-pos-backend.git
   git push -u origin main
   ```

---

## BAGIAN 2: Deploy ke Koyeb (Gratis)

Setelah code ada di GitHub:

1. **Login ke Koyeb:**
   - https://app.koyeb.com/

2. **Buat App Baru:**
   - Klik **"Create App"**
   - Pilih source: **GitHub**
   - Pilih repository: `coffee-pos-backend`

3. **Konfigurasi Builder:**
   - Buildpack: **Node.js** (biasanya otomatis terdeteksi)
   - Run Command: `npm start`
   - Privilege: Biarkan default

4. **Environment Variables (PENTING!):**
   Klik **"Add Variable"** dan masukkan data dari `.env` kita:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | `postgresql://postgres.ftqfazoxoezseklazucg:Kebersamaan123@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres` |
   | `JWT_SECRET` | `coffee-pos-secret-key-2024-change-this` |
   | `SHOP_DOMAIN` | Kosongkan dulu atau isi sembarang |

5. **Deploy:**
   - Klik tombol **"Deploy"**
   - Tunggu status berubah menjadi **Healthy** (hijau)

6. **Dapatkan URL:**
   - Copy Public URL yang diberikan Koyeb (contoh: `https://coffee-pos-backend-user.koyeb.app`)

---

## BAGIAN 3: Update Frontend & Mobile App

Setelah mendapatkan URL dari Koyeb (langkah di atas), beri tahu saya URL-nya.
Saya akan bantu update konfigurasi di:
1. Frontend Public (agar bisa connect ke backend)
2. Frontend Backoffice
3. Mobile App (untuk build APK final)
