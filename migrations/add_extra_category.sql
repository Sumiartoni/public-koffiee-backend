-- Migration: Extra Categories System Redesign
-- This replaces the flat extra system with hierarchical categories

-- 1. Create extra_categories table
CREATE TABLE IF NOT EXISTS extra_categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    is_required BOOLEAN DEFAULT FALSE,
    max_select INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add category_id to extras table
ALTER TABLE extras ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES extra_categories(id) ON DELETE SET NULL;

-- 3. Remove old text category column if exists
ALTER TABLE extras DROP COLUMN IF EXISTS category;

-- 4. Create new junction table: link categories to menu items
CREATE TABLE IF NOT EXISTS menu_item_extra_categories (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    extra_category_id INTEGER NOT NULL REFERENCES extra_categories(id) ON DELETE CASCADE,
    UNIQUE(menu_item_id, extra_category_id)
);

-- 5. (Optional) Migrate existing extras: create a default category and assign existing extras
-- INSERT INTO extra_categories (name, is_required, max_select) VALUES ('Topping', false, 3) RETURNING id;
-- UPDATE extras SET category_id = (SELECT id FROM extra_categories WHERE name = 'Topping' LIMIT 1);

-- 6. Old junction table can be kept for backward compat or dropped:
-- DROP TABLE IF EXISTS menu_item_extras;
