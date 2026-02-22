-- =============================================
-- MIGRATION: Loyalty Point System
-- Adds loyalty_settings table + extends user_points
-- =============================================

-- 1. LOYALTY SETTINGS (Singleton config table)
CREATE TABLE IF NOT EXISTS loyalty_settings (
  id SERIAL PRIMARY KEY,
  point_per_rupiah DECIMAL(10,6) DEFAULT 0.001,
  min_purchase INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default row if empty
INSERT INTO loyalty_settings (point_per_rupiah, min_purchase, is_active)
SELECT 0.001, 0, true
WHERE NOT EXISTS (SELECT 1 FROM loyalty_settings);

-- 2. EXTEND user_points: Add order_id for double-point prevention
ALTER TABLE user_points ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id);

-- Allow 'manual' type alongside 'earn' and 'redeem'
ALTER TABLE user_points DROP CONSTRAINT IF EXISTS user_points_type_check;
ALTER TABLE user_points ADD CONSTRAINT user_points_type_check 
  CHECK (type IN ('earn', 'redeem', 'manual'));

-- Index for fast lookup by order_id (double-point prevention)
CREATE INDEX IF NOT EXISTS idx_user_points_order_id ON user_points(order_id);

-- 3. Ensure users.points column exists (denormalized for fast read)
ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;
