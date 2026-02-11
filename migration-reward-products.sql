-- =============================================
-- MIGRATION: Reward Product System
-- 3 new tables for point & referral rewards
-- =============================================

-- 1. REWARD PRODUCTS (Master reward yang bisa ditukar)
CREATE TABLE IF NOT EXISTS reward_products (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  product_id INTEGER REFERENCES menu_items(id),
  points_required INTEGER,       -- Jika diisi = reward untuk point
  referral_required INTEGER,     -- Jika diisi = reward untuk referral
  quota INTEGER,                 -- Nullable = unlimited
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. USER POINTS (Riwayat poin user)
CREATE TABLE IF NOT EXISTS user_points (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('earn', 'redeem')),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. USER REWARDS (Reward produk yang dimiliki user)
CREATE TABLE IF NOT EXISTS user_rewards (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  reward_id INTEGER NOT NULL REFERENCES reward_products(id),
  is_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
