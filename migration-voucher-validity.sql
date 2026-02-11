-- =============================================
-- MIGRATION: Voucher Validity (Relative Days)
-- =============================================

-- 1. Add valid_days to customer_vouchers
-- Default to 30 days for existing vouchers to maintain validity logic
ALTER TABLE customer_vouchers 
ADD COLUMN IF NOT EXISTS valid_days INTEGER DEFAULT 30;

-- 2. Add expired_at to user_vouchers
ALTER TABLE user_vouchers 
ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP;

-- Optional: Backfill expired_at for existing user_vouchers based on created_at + 30 days
-- UPDATE user_vouchers SET expired_at = created_at + INTERVAL '30 days' WHERE expired_at IS NULL;
