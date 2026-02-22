-- Migration: Add redeem tracking columns to order_items
-- Run this on production database before deploying backend changes

-- Track which order items are redemptions (point or referral)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_redeem BOOLEAN DEFAULT FALSE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS redeem_type TEXT; -- 'point' or 'referral'
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS reward_id INTEGER;
