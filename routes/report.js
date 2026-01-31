import express from 'express';
import db from '../db.js';

const router = express.Router();

// Helper to get date range strings (WIB/UTC+7 aware) - FORCED UPDATE POSGRES FIX
const getRange = (start, end) => {
  const nowWIB = new Date(new Date().getTime() + (7 * 60 * 60 * 1000));
  const s = start || nowWIB.toISOString().slice(0, 10);
  const e = end || nowWIB.toISOString().slice(0, 10);

  // Calculate next day for < queries
  const d = new Date(e);
  d.setDate(d.getDate() + 1);
  const eNext = d.toISOString().slice(0, 10);

  return { s, e, eNext };
};

// 1. DASHBOARD SUMMARY
router.get('/dashboard', async (req, res) => {
  try {
    const { s: todayStr } = getRange();
    const yesterday = new Date(new Date(todayStr).getTime() - (24 * 60 * 60 * 1000));
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Sales Today
    const sales = await db.get(`
            SELECT 
                COUNT(*) as total_orders, 
                COALESCE(SUM(total), 0) as total_revenue,
                COALESCE(SUM(total_hpp), 0) as total_cogs 
            FROM orders 
            WHERE status = 'completed' 
            AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date = $1::date
        `, [todayStr]);

    // Sales Yesterday
    const salesYesterday = await db.get(`
            SELECT COALESCE(SUM(total), 0) as total_revenue
            FROM orders 
            WHERE status = 'completed' 
            AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date = $1::date
        `, [yesterdayStr]);

    const expense = await db.get("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date = $1", [todayStr]);

    const gross_profit = sales.total_revenue - sales.total_cogs;
    const net_profit = gross_profit - (expense.total || 0);

    const gross_margin = sales.total_revenue > 0 ? Math.round((gross_profit / sales.total_revenue) * 100) : 0;
    const net_margin = sales.total_revenue > 0 ? Math.round((net_profit / sales.total_revenue) * 100) : 0;

    // Calculate Trend vs Yesterday
    let revenueTrendVal = 0;
    if (salesYesterday.total_revenue > 0) {
      revenueTrendVal = Math.round(((sales.total_revenue - salesYesterday.total_revenue) / salesYesterday.total_revenue) * 100);
    }

    const topProducts = await db.all(`
            SELECT 
                mi.emoji,
                oi.menu_item_name as name, 
                SUM(oi.quantity) as total_sold,
                mi.price,
                mi.hpp,
                SUM(oi.subtotal) as revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
            WHERE o.status = 'completed' 
            AND (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date = $1::date
            GROUP BY oi.menu_item_id, oi.menu_item_name, mi.emoji, mi.price, mi.hpp
            ORDER BY total_sold DESC LIMIT 5
        `, [todayStr]);

    const revenueTrend = await db.all(`
            SELECT 
                to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') as date, 
                SUM(total) as revenue, 
                SUM(total_hpp) as hpp
            FROM orders
            WHERE status = 'completed' 
            AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date >= (NOW() AT TIME ZONE 'Asia/Jakarta')::date - INTERVAL '6 days'
            GROUP BY 1
            ORDER BY 1 ASC
        `);

    res.json({
      sales: parseInt(sales.total_revenue),
      orders: parseInt(sales.total_orders),
      gross_profit,
      net_profit,
      gross_margin,
      net_margin,
      revenue_trend: revenueTrendVal,
      aov: sales.total_orders > 0 ? Math.round(sales.total_revenue / sales.total_orders) : 0,
      topProducts,
      revenueTrend
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 2. ADVANCED REPORTS
router.get('/advanced', async (req, res) => {
  const { start, end } = req.query;
  const { s, e } = getRange(start, end);

  // Calculate next day for < queries (YYYY-MM-DD + 1 day)
  const d = new Date(e);
  d.setDate(d.getDate() + 1);
  const eNext = d.toISOString().slice(0, 10);

  try {
    console.log(`[REPORT] Generating Advanced Report from ${s} to ${e}`);

    // Summary & AOV
    const summaryRaw = await db.get(`
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total), 0) as gross_sales,
                COALESCE(SUM(discount), 0) as total_discount,
                COALESCE(SUM(tax), 0) as total_tax,
                COALESCE(SUM(total_hpp), 0) as total_cogs
            FROM orders
            WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $1::date AND $2::date 
            AND status = 'completed'
        `, [s, e]);

    // Handle case where summaryRaw is null
    const summary = summaryRaw || {
      total_orders: 0, gross_sales: 0, total_discount: 0, total_tax: 0, total_cogs: 0
    };

    // Payment Methods Breakdown
    const paymentMethods = await db.all(`
            SELECT payment_method, COUNT(*) as count, SUM(total) as revenue
            FROM orders
            WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $1::date AND $2::date 
            AND status = 'completed'
            GROUP BY payment_method
        `, [s, e]);

    // Order Type Breakdown
    const orderTypes = await db.all(`
            SELECT order_type, COUNT(*) as count, SUM(total) as revenue
            FROM orders
            WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $1::date AND $2::date 
            AND status = 'completed'
            GROUP BY order_type
        `, [s, e]);

    // Cashier Performance
    const cashiers = await db.all(`
            SELECT COALESCE(users.name, 'Staff') as name, COUNT(*) as orders, SUM(orders.total) as revenue
            FROM orders
            LEFT JOIN users ON orders.user_id = users.id
            WHERE (orders.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $1::date AND $2::date 
            AND orders.status = 'completed'
            GROUP BY COALESCE(users.name, 'Staff')
        `, [s, e]);

    // Category Analysis
    // Postgres GROUP BY logic requires strict grouping
    const categories = await db.all(`
            SELECT c.name, COUNT(oi.id) as volume, SUM(oi.subtotal) as revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN menu_items mi ON oi.menu_item_id = mi.id
            JOIN categories c ON mi.category_id = c.id
            WHERE o.created_at >= $1::timestamp AND o.created_at < $2::timestamp 
            AND o.status = 'completed'
            GROUP BY c.id, c.name
        `, [s, eNext]);

    // Product Analysis (NEW)
    const products = await db.all(`
            SELECT menu_item_name as name, SUM(quantity) as volume, SUM(oi.subtotal) as revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.created_at >= $1::timestamp AND o.created_at < $2::timestamp 
            AND o.status = 'completed'
            GROUP BY menu_item_name
            ORDER BY revenue DESC
        `, [s, eNext]);

    // Void Orders - Check if column exists first or try/catch individual query if worried
    let voids = [];
    try {
      voids = await db.all(`
            SELECT order_number, customer_name, total, notes as void_reason, created_at
            FROM orders
            WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $1::date AND $2::date 
            AND status = 'cancelled'
        `, [s, e]);
    } catch (e) {
      console.error("Void query failed", e.message);
    }

    const gross_profit = (parseFloat(summary.gross_sales) || 0) - (parseFloat(summary.total_cogs) || 0);

    // Expenses
    const expenses = await db.get('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date >= $1::date AND expense_date < $2::date', [s, eNext]);
    const net_profit = gross_profit - (parseFloat(expenses?.total) || 0);

    const gross_margin = summary.gross_sales > 0 ? Math.round((gross_profit / summary.gross_sales) * 100) : 0;
    const net_margin = summary.gross_sales > 0 ? Math.round((net_profit / summary.gross_sales) * 100) : 0;

    res.json({
      summary: {
        ...summary,
        total_orders: parseInt(summary.total_orders),
        gross_sales: parseFloat(summary.gross_sales),
        net_sales: parseFloat(summary.gross_sales),
        gross_profit,
        net_profit,
        gross_margin,
        net_margin,
        aov: summary.total_orders > 0 ? Math.round(summary.gross_sales / summary.total_orders) : 0
      },
      paymentMethods: paymentMethods.map(p => ({ ...p, count: parseInt(p.count), revenue: parseFloat(p.revenue) })),
      orderTypes: orderTypes.map(p => ({ ...p, count: parseInt(p.count), revenue: parseFloat(p.revenue) })),
      cashiers: cashiers.map(p => ({ ...p, orders: parseInt(p.orders), revenue: parseFloat(p.revenue) })),
      categories: categories.map(p => ({ ...p, volume: parseInt(p.volume), revenue: parseFloat(p.revenue) })),
      products: products.map(p => ({ ...p, volume: parseInt(p.volume), revenue: parseFloat(p.revenue) })),
      voids
    });
  } catch (err) {
    console.error("[REPORT ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

// 3. TIME-BASED BREAKDOWN (Hourly, Daily, etc.) - WIB Timezone Aware
router.get('/breakdown/:type', async (req, res) => {
  const { type } = req.params;
  const { start, end } = req.query;
  const { s, e, eNext } = getRange(start, end);

  let format = 'YYYY-MM-DD';
  if (type === 'hourly') format = 'HH24:00';
  if (type === 'monthly') format = 'YYYY-MM';
  if (type === 'weekly') format = 'IYYY-IW'; // ISO Week

  try {
    const data = await db.all(`
            SELECT 
                to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', $1) as label, 
                COUNT(*) as orders, 
                SUM(total) as revenue
            FROM orders
            WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date 
            AND status = 'completed'
            GROUP BY 1
            ORDER BY 1 ASC
        `, [format, s, (end || s)]);

    res.json({ data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. CUSTOMER HISTORY
router.get('/customers', async (req, res) => {
  try {
    const data = await db.all(`
            SELECT customer_name, COUNT(*) as visit_count, SUM(total) as total_spent, MAX(created_at) as last_visit
            FROM orders
            WHERE status = 'completed' AND customer_name IS NOT NULL AND customer_name != 'Walk-in Customer'
            GROUP BY customer_name
            ORDER BY total_spent DESC
        `);
    res.json({ customers: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. VARIANT/EXTRA ANALYSIS
router.get('/variants', async (req, res) => {
  // Variant column not yet implemented in order_items
  res.json({ variants: [] });
});

export default router;
