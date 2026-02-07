import db from './db.js';

/**
 * Auto-cancel old unconfirmed orders
 * Cancels orders that are:
 * - Status 'pending' or 'unpaid' (not confirmed by cashier)
 * - Created more than 1 hour ago
 */
export async function autoCancelOldOrders() {
    try {
        console.log('[AUTO-CANCEL] Checking for old unconfirmed orders...');

        // Calculate 1 hour ago timestamp
        const oneHourAgo = new Date();
        oneHourAgo.setHours(oneHourAgo.getHours() - 1);
        const oneHourAgoStr = oneHourAgo.toISOString();

        // Find orders that are pending/unpaid and older than 1 hour
        const oldOrders = await db.all(`
            SELECT id, order_number, customer_name, status, created_at 
            FROM orders 
            WHERE (status = 'pending' OR status = 'unpaid')
            AND created_at < $1
            ORDER BY created_at ASC
        `, [oneHourAgoStr]);

        if (oldOrders.length === 0) {
            console.log('[AUTO-CANCEL] No old orders found');
            return { cancelled: 0 };
        }

        console.log(`[AUTO-CANCEL] Found ${oldOrders.length} old unconfirmed orders`);

        let cancelledCount = 0;

        for (const order of oldOrders) {
            try {
                // Get order items for stock restoration
                const orderItems = await db.all('SELECT * FROM order_items WHERE order_id = $1', [order.id]);

                // Restore stock for each item
                for (const item of orderItems) {
                    const recipes = await db.all('SELECT * FROM recipes WHERE menu_item_id = $1', [item.menu_item_id]);
                    for (const recipe of recipes) {
                        const restoreQty = Number(recipe.quantity) * Number(item.quantity);
                        await db.run('UPDATE ingredients SET stock_qty = stock_qty + $1 WHERE id = $2', [restoreQty, recipe.ingredient_id]);
                    }
                }

                // Cancel the order
                await db.run("UPDATE orders SET status = 'cancelled' WHERE id = $1", [order.id]);

                const orderAge = Math.round((new Date() - new Date(order.created_at)) / 1000 / 60); // minutes
                console.log(`[AUTO-CANCEL] Cancelled order ${order.order_number} (${order.customer_name}) - Age: ${orderAge} minutes`);

                cancelledCount++;
            } catch (err) {
                console.error(`[AUTO-CANCEL ERROR] Failed to cancel order ${order.id}:`, err.message);
            }
        }

        console.log(`[AUTO-CANCEL] Successfully cancelled ${cancelledCount}/${oldOrders.length} orders`);
        return { cancelled: cancelledCount, total: oldOrders.length };

    } catch (err) {
        console.error('[AUTO-CANCEL ERROR]', err);
        return { error: err.message };
    }
}

/**
 * Start the auto-cancel scheduler
 * Runs every 10 minutes to check for old orders
 */
export function startAutoCancelScheduler() {
    // Run immediately on startup
    autoCancelOldOrders();

    // Then run every 10 minutes
    const intervalMinutes = 10;
    setInterval(() => {
        autoCancelOldOrders();
    }, intervalMinutes * 60 * 1000);

    console.log(`[AUTO-CANCEL] Scheduler started (runs every ${intervalMinutes} minutes)`);
}
