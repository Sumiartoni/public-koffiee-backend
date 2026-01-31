-- TAMBAHKAN KOLOM-KOLOM INI KE TABEL 'ORDERS'
-- Copy dan Paste kode ini ke SQL Editor Supabase Anda lalu klik RUN

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'dine-in';

-- Optional: Tambahkan kolom is_active ke users jika belum ada
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1;

-- Optional: Tambahkan kolom role ke users jika belum ada
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'cashier';
