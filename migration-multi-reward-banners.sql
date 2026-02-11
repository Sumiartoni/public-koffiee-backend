-- =============================================
-- MIGRATION: Multi-Product Reward + App Banners
-- =============================================

-- 1. Junction table: reward <-> product (many-to-many)
CREATE TABLE IF NOT EXISTS reward_product_items (
  id SERIAL PRIMARY KEY,
  reward_id INTEGER NOT NULL REFERENCES reward_products(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. App Banners
CREATE TABLE IF NOT EXISTS app_banners (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  image_url TEXT,
  link_type TEXT DEFAULT 'none' CHECK (link_type IN ('none', 'product', 'category', 'external')),
  link_value TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
