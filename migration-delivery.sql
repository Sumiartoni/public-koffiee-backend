-- =============================================
-- MIGRATION: Add Delivery Fee Columns
-- Run this on your existing PostgreSQL database
-- =============================================

-- Add delivery columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_distance_km DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lat DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lng DOUBLE PRECISION;

-- Add delivery settings
-- IMPORTANT: Update store_lat and store_lng to your actual store coordinates!
INSERT INTO settings (key, value) VALUES
  ('store_lat', '-8.233556'),
  ('store_lng', '111.451583'),
  ('delivery_base_fee', '5000'),
  ('delivery_per_km', '3000'),
  ('delivery_max_km', '15'),
  ('delivery_free_km', '1')
ON CONFLICT (key) DO NOTHING;
