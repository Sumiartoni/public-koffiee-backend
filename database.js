import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, 'coffee-pos.db'));

export function initDatabase() {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // =============================================
  // USERS TABLE
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      role TEXT DEFAULT 'cashier',
      otp_code TEXT,
      otp_expiry DATETIME,
      is_verified INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // =============================================
  // CATEGORIES TABLE
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      emoji TEXT,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // =============================================
  // INGREDIENTS TABLE (Bahan Baku untuk Resep)
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      price_per_unit INTEGER NOT NULL,
      stock_qty REAL DEFAULT 0,
      min_stock REAL DEFAULT 0,
      supplier TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // =============================================
  // MENU ITEMS TABLE (dengan HPP)
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      price INTEGER NOT NULL,
      hpp INTEGER DEFAULT 0,
      hpp_type TEXT DEFAULT 'manual',
      description TEXT,
      image_url TEXT,
      emoji TEXT,
      is_available BOOLEAN DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  // =============================================
  // RECIPES TABLE (Resep untuk menghitung HPP otomatis)
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    )
  `);

  // =============================================
  // ORDERS TABLE
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      notes TEXT,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // =============================================
  // ORDER ITEMS TABLE
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      menu_item_id INTEGER NOT NULL,
      menu_item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price INTEGER NOT NULL,
      hpp INTEGER DEFAULT 0,
      subtotal INTEGER NOT NULL,
      notes TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    )
  `);

  // =============================================
  // EXPENSES TABLE (Pengeluaran Harian)
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date DATE NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL,
      payment_method TEXT DEFAULT 'cash',
      receipt_image TEXT,
      notes TEXT,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // =============================================
  // EXPENSE CATEGORIES
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emoji TEXT,
      is_active INTEGER DEFAULT 1
    )
  `);

  // =============================================
  // RECEIPT TEMPLATES (Template Struk)
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS receipt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // =============================================
  // CASH DRAWER (Kas Harian)
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_drawer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drawer_date DATE NOT NULL,
      opening_balance INTEGER DEFAULT 0,
      closing_balance INTEGER,
      total_sales INTEGER DEFAULT 0,
      total_cash_received INTEGER DEFAULT 0,
      total_expenses INTEGER DEFAULT 0,
      expected_balance INTEGER,
      difference INTEGER,
      status TEXT DEFAULT 'open',
      opened_by INTEGER,
      closed_by INTEGER,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      notes TEXT,
      FOREIGN KEY (opened_by) REFERENCES users(id),
      FOREIGN KEY (closed_by) REFERENCES users(id)
    )
  `);

  // =============================================
  // SETTINGS TABLE
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // =============================================
  // DATABASE MIGRATIONS
  // =============================================
  runMigrations();

  // =============================================
  // INSERT DEFAULT DATA
  // =============================================
  insertDefaultData();

  console.log('✅ Database initialized successfully with all tables');
}

function runMigrations() {
  try {
    // Menu items migrations
    const menuInfo = db.prepare("PRAGMA table_info(menu_items)").all();
    const menuCols = menuInfo.map(c => c.name);
    if (!menuCols.includes('hpp')) db.exec("ALTER TABLE menu_items ADD COLUMN hpp INTEGER DEFAULT 0");
    if (!menuCols.includes('hpp_type')) db.exec("ALTER TABLE menu_items ADD COLUMN hpp_type TEXT DEFAULT 'manual'");

    // Orders migrations
    const orderInfo = db.prepare("PRAGMA table_info(orders)").all();
    const orderCols = orderInfo.map(c => c.name);
    if (!orderCols.includes('total_hpp')) db.exec("ALTER TABLE orders ADD COLUMN total_hpp INTEGER DEFAULT 0");
    if (!orderCols.includes('table_number')) db.exec("ALTER TABLE orders ADD COLUMN table_number TEXT");
    if (!orderCols.includes('discount')) db.exec("ALTER TABLE orders ADD COLUMN discount INTEGER DEFAULT 0");
    if (!orderCols.includes('completed_at')) db.exec("ALTER TABLE orders ADD COLUMN completed_at DATETIME");

    // Order items migrations
    const orderItemInfo = db.prepare("PRAGMA table_info(order_items)").all();
    const orderItemCols = orderItemInfo.map(c => c.name);
    if (!orderItemCols.includes('hpp')) db.exec("ALTER TABLE order_items ADD COLUMN hpp INTEGER DEFAULT 0");
    if (!orderItemCols.includes('menu_item_name')) db.exec("ALTER TABLE order_items ADD COLUMN menu_item_name TEXT");

    // Users migrations
    const userInfo = db.prepare("PRAGMA table_info(users)").all();
    const userCols = userInfo.map(c => c.name);
    if (!userCols.includes('is_active')) db.exec("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1");

    // Categories migrations
    const catInfo = db.prepare("PRAGMA table_info(categories)").all();
    const catCols = catInfo.map(c => c.name);
    if (!catCols.includes('is_active')) db.exec("ALTER TABLE categories ADD COLUMN is_active INTEGER DEFAULT 1");

    console.log('✅ Database migrations completed');
  } catch (e) {
    console.log('ℹ️ Migration check:', e.message);
  }
}

function insertDefaultData() {
  // Default admin user
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password, name, role, is_verified, is_active) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('admin', hashedPassword, 'Administrator', 'admin', 1, 1);
    console.log('✅ Default admin created (admin / admin123)');
  }

  // Default cashier user
  const cashierExists = db.prepare('SELECT id FROM users WHERE username = ?').get('kasir');
  if (!cashierExists) {
    const hashedPassword = bcrypt.hashSync('kasir123', 10);
    db.prepare(`
      INSERT INTO users (username, password, name, role, is_verified, is_active) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('kasir', hashedPassword, 'Kasir Utama', 'cashier', 1, 1);
    console.log('✅ Default cashier created (kasir / kasir123)');
  }

  // Default categories
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (catCount.count === 0) {
    const categories = [
      { name: 'Espresso', slug: 'espresso', emoji: '☕', order: 1 },
      { name: 'Manual Brew', slug: 'manual-brew', emoji: '☕', order: 2 },
      { name: 'Non-Coffee', slug: 'non-coffee', emoji: '🍵', order: 3 },
      { name: 'Tea', slug: 'tea', emoji: '🍃', order: 4 },
      { name: 'Pastry', slug: 'pastry', emoji: '🥐', order: 5 },
      { name: 'Food', slug: 'food', emoji: '🍽️', order: 6 }
    ];
    const stmt = db.prepare('INSERT INTO categories (name, slug, emoji, display_order) VALUES (?, ?, ?, ?)');
    categories.forEach(c => stmt.run(c.name, c.slug, c.emoji, c.order));
    console.log('✅ Default categories created');
  }

  // Default ingredients
  const ingCount = db.prepare('SELECT COUNT(*) as count FROM ingredients').get();
  if (ingCount.count === 0) {
    const ingredients = [
      { name: 'Kopi Arabica', unit: 'gram', price: 150, stock: 5000 },
      { name: 'Kopi Robusta', unit: 'gram', price: 100, stock: 3000 },
      { name: 'Susu Segar', unit: 'ml', price: 15, stock: 10000 },
      { name: 'Susu UHT', unit: 'ml', price: 12, stock: 15000 },
      { name: 'Gula Pasir', unit: 'gram', price: 15, stock: 5000 },
      { name: 'Syrup Vanilla', unit: 'ml', price: 50, stock: 2000 },
      { name: 'Syrup Caramel', unit: 'ml', price: 55, stock: 2000 },
      { name: 'Syrup Hazelnut', unit: 'ml', price: 55, stock: 1500 },
      { name: 'Matcha Powder', unit: 'gram', price: 200, stock: 1000 },
      { name: 'Coklat Bubuk', unit: 'gram', price: 80, stock: 2000 },
      { name: 'Es Batu', unit: 'pcs', price: 200, stock: 500 },
      { name: 'Cup Plastik 16oz', unit: 'pcs', price: 500, stock: 500 },
      { name: 'Cup Plastik 22oz', unit: 'pcs', price: 700, stock: 300 },
      { name: 'Lid Cup', unit: 'pcs', price: 100, stock: 800 },
      { name: 'Sedotan', unit: 'pcs', price: 50, stock: 1000 }
    ];
    const stmt = db.prepare('INSERT INTO ingredients (name, unit, price_per_unit, stock_qty) VALUES (?, ?, ?, ?)');
    ingredients.forEach(i => stmt.run(i.name, i.unit, i.price, i.stock));
    console.log('✅ Default ingredients created');
  }

  // Default menu items dengan HPP
  const menuCount = db.prepare('SELECT COUNT(*) as count FROM menu_items').get();
  if (menuCount.count === 0) {
    const menuItems = [
      // Espresso
      { name: 'Espresso', catId: 1, price: 18000, hpp: 4500, emoji: '☕' },
      { name: 'Double Espresso', catId: 1, price: 25000, hpp: 7000, emoji: '☕' },
      { name: 'Americano', catId: 1, price: 22000, hpp: 5000, emoji: '☕' },
      { name: 'Cappuccino', catId: 1, price: 28000, hpp: 8000, emoji: '☕' },
      { name: 'Latte', catId: 1, price: 30000, hpp: 8500, emoji: '🥛' },
      { name: 'Flat White', catId: 1, price: 32000, hpp: 9000, emoji: '☕' },
      { name: 'Mocha', catId: 1, price: 35000, hpp: 11000, emoji: '🍫' },
      { name: 'Caramel Macchiato', catId: 1, price: 38000, hpp: 12000, emoji: '🍯' },
      // Manual Brew
      { name: 'V60 Pour Over', catId: 2, price: 35000, hpp: 8000, emoji: '☕' },
      { name: 'Cold Brew', catId: 2, price: 32000, hpp: 7000, emoji: '🧊' },
      { name: 'Affogato', catId: 2, price: 38000, hpp: 12000, emoji: '🍨' },
      // Non-Coffee
      { name: 'Matcha Latte', catId: 3, price: 32000, hpp: 10000, emoji: '🍵' },
      { name: 'Hot Chocolate', catId: 3, price: 28000, hpp: 8000, emoji: '🍫' },
      { name: 'Strawberry Smoothie', catId: 3, price: 35000, hpp: 12000, emoji: '🍓' },
      // Tea
      { name: 'Earl Grey', catId: 4, price: 22000, hpp: 5000, emoji: '🍃' },
      { name: 'Jasmine Tea', catId: 4, price: 22000, hpp: 5000, emoji: '🌸' },
      { name: 'Thai Tea', catId: 4, price: 28000, hpp: 8000, emoji: '🧡' },
      // Pastry
      { name: 'Croissant', catId: 5, price: 25000, hpp: 12000, emoji: '🥐' },
      { name: 'Pain au Chocolat', catId: 5, price: 30000, hpp: 15000, emoji: '🍫' },
      { name: 'Cinnamon Roll', catId: 5, price: 28000, hpp: 13000, emoji: '🌀' },
      // Food
      { name: 'Avocado Toast', catId: 6, price: 45000, hpp: 18000, emoji: '🥑' },
      { name: 'Club Sandwich', catId: 6, price: 55000, hpp: 22000, emoji: '🥪' },
      { name: 'Eggs Benedict', catId: 6, price: 58000, hpp: 25000, emoji: '🍳' }
    ];
    const stmt = db.prepare('INSERT INTO menu_items (name, category_id, price, hpp, hpp_type, emoji, description) VALUES (?, ?, ?, ?, ?, ?, ?)');
    menuItems.forEach(m => stmt.run(m.name, m.catId, m.price, m.hpp, 'manual', m.emoji, `Premium ${m.name}`));
    console.log('✅ Default menu items created with HPP');
  }

  // Default expense categories
  const expCatCount = db.prepare('SELECT COUNT(*) as count FROM expense_categories').get();
  if (expCatCount.count === 0) {
    const expenseCategories = [
      { name: 'Bahan Baku', emoji: '📦' },
      { name: 'Es Batu', emoji: '🧊' },
      { name: 'Kemasan', emoji: '🥤' },
      { name: 'Operasional', emoji: '⚙️' },
      { name: 'Listrik & Air', emoji: '💡' },
      { name: 'Gaji Karyawan', emoji: '💰' },
      { name: 'Transportasi', emoji: '🚗' },
      { name: 'Peralatan', emoji: '🔧' },
      { name: 'Lain-lain', emoji: '📝' }
    ];
    const stmt = db.prepare('INSERT INTO expense_categories (name, emoji) VALUES (?, ?)');
    expenseCategories.forEach(c => stmt.run(c.name, c.emoji));
    console.log('✅ Default expense categories created');
  }

  // Default receipt template
  const templateCount = db.prepare('SELECT COUNT(*) as count FROM receipt_templates').get();
  if (templateCount.count === 0) {
    db.prepare(`
      INSERT INTO receipt_templates (
        name, is_default, header_text, footer_text, 
        show_logo, show_address, show_phone, show_cashier,
        show_order_number, show_date_time, show_items, show_subtotal,
        show_tax, show_discount, show_total, show_payment_method,
        show_change, show_thank_you, paper_width
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Template Default', 1,
      'PUBLIC KOFFIEE\nPremium Dark Roast',
      'Terima kasih telah berkunjung!\nFollow @publickoffiee',
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 58
    );
    console.log('✅ Default receipt template created');
  }

  // Default settings
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (settingsCount.count === 0) {
    const settings = [
      { key: 'shop_name', value: 'Public Koffiee' },
      { key: 'shop_tagline', value: 'Premium Dark Roast Since 2024' },
      { key: 'shop_address', value: 'Jl. Kopi Premium No. 88, Jakarta' },
      { key: 'shop_phone', value: '+62 21 1234 5678' },
      { key: 'shop_email', value: 'hello@publickoffiee.id' },
      { key: 'shop_whatsapp', value: '6281234567890' },
      { key: 'tax_percentage', value: '10' },
      { key: 'currency', value: 'IDR' },
      { key: 'printer_enabled', value: 'true' },
      { key: 'printer_name', value: 'Bluetooth Printer' },
      { key: 'qris_enabled', value: 'true' },
      { key: 'qris_merchant_name', value: 'PUBLIC KOFFIEE' }
    ];
    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    settings.forEach(s => stmt.run(s.key, s.value));
    console.log('✅ Default settings created');
  }
}

export default db;
