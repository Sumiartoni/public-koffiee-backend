-- =============================================
-- SQL SCHEMA UNTUK POSTGRESQL (SUPABASE)
-- Copy-Paste isi file ini ke SQL Editor Supabase
-- =============================================

-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  role TEXT DEFAULT 'cashier',
  otp_code TEXT,
  otp_expiry TIMESTAMP,
  is_verified INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- EXPENSE CATEGORIES
CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  is_active INTEGER DEFAULT 1
);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  emoji TEXT,
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INGREDIENTS
CREATE TABLE IF NOT EXISTS ingredients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  price_per_unit INTEGER NOT NULL,
  stock_qty REAL DEFAULT 0,
  min_stock REAL DEFAULT 0,
  supplier TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MENU ITEMS
CREATE TABLE IF NOT EXISTS menu_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  price INTEGER NOT NULL,
  hpp INTEGER DEFAULT 0,
  hpp_type TEXT DEFAULT 'manual',
  description TEXT,
  image_url TEXT,
  emoji TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RECIPES
CREATE TABLE IF NOT EXISTS recipes (
  id SERIAL PRIMARY KEY,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  quantity REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- EXTRAS (for menu item variants like size, sugar level, etc)
CREATE TABLE IF NOT EXISTS extras (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MENU ITEM EXTRAS JUNCTION TABLE
CREATE TABLE IF NOT EXISTS menu_item_extras (
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  extra_id INTEGER NOT NULL REFERENCES extras(id) ON DELETE CASCADE,
  PRIMARY KEY(menu_item_id, extra_id)
);

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  order_type TEXT DEFAULT 'dine-in',
  table_number TEXT,
  status TEXT DEFAULT 'pending',
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  subtotal INTEGER NOT NULL,
  tax INTEGER NOT NULL,
  discount INTEGER DEFAULT 0,
  total INTEGER NOT NULL,
  total_hpp INTEGER DEFAULT 0,
  unique_code INTEGER DEFAULT 0,
  final_amount INTEGER DEFAULT 0,
  payment_expires_at TIMESTAMP,
  notes TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  menu_item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price INTEGER NOT NULL,
  hpp INTEGER DEFAULT 0,
  subtotal INTEGER NOT NULL,
  notes TEXT,
  extras TEXT
);

-- EXPENSES
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  receipt_image TEXT,
  notes TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RECEIPT TEMPLATES
CREATE TABLE IF NOT EXISTS receipt_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  header_text TEXT,
  footer_text TEXT,
  show_logo INTEGER DEFAULT 1,
  show_address INTEGER DEFAULT 1,
  show_phone INTEGER DEFAULT 1,
  show_cashier INTEGER DEFAULT 1,
  show_order_number INTEGER DEFAULT 1,
  show_date_time INTEGER DEFAULT 1,
  show_items INTEGER DEFAULT 1,
  show_subtotal INTEGER DEFAULT 1,
  show_tax INTEGER DEFAULT 1,
  show_discount INTEGER DEFAULT 1,
  show_total INTEGER DEFAULT 1,
  show_payment_method INTEGER DEFAULT 1,
  show_change INTEGER DEFAULT 1,
  show_thank_you INTEGER DEFAULT 1,
  custom_css TEXT,
  paper_width INTEGER DEFAULT 58,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CASH DRAWER
CREATE TABLE IF NOT EXISTS cash_drawer (
  id SERIAL PRIMARY KEY,
  drawer_date DATE NOT NULL,
  opening_balance INTEGER DEFAULT 0,
  closing_balance INTEGER,
  total_sales INTEGER DEFAULT 0,
  total_cash_received INTEGER DEFAULT 0,
  total_expenses INTEGER DEFAULT 0,
  expected_balance INTEGER,
  difference INTEGER,
  status TEXT DEFAULT 'open',
  opened_by INTEGER REFERENCES users(id),
  closed_by INTEGER REFERENCES users(id),
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  notes TEXT
);

-- PROMOTIONS
CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  buy_item_id INTEGER,
  buy_qty INTEGER,
  get_item_id INTEGER,
  get_qty INTEGER,
  min_purchase INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DISCOUNTS
CREATE TABLE IF NOT EXISTS discounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  type TEXT NOT NULL,
  value INTEGER NOT NULL,
  min_purchase INTEGER DEFAULT 0,
  max_discount INTEGER,
  start_date DATE,
  end_date DATE,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SETTINGS
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SEED DEFAULT DATA
-- Insert default admin user (password: admin123)
INSERT INTO users (username, password, name, role, is_verified) 
VALUES ('admin', '$2a$10$EpRZCxYPP7T.MAtPdnqNp.YpkFRl6RQl.A6PQKVkKXYQp5G5zO9lO', 'Administrator', 'admin', 1)
ON CONFLICT (username) DO NOTHING;

-- Insert default expense categories
INSERT INTO expense_categories (name, emoji) VALUES 
  ('Bahan Baku & Kopi', '📦'),
  ('Operasional & Listrik', '⚡'),
  ('Gaji Karyawan', '👤'),
  ('Perbaikan & Maintenance', '🛠️'),
  ('Lain-lain', '📝')
ON CONFLICT DO NOTHING;
