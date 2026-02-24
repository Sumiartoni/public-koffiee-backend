-- =============================================
-- MIGRATION: Referral ↔ Reward Integration
-- =============================================

-- 1. Prevent double referral: 1 user baru = 1 referral count
ALTER TABLE referral_rewards ADD CONSTRAINT uq_referred_id UNIQUE (referred_id);

-- 2. Track reward source (point / referral / manual)
ALTER TABLE user_rewards ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'point';

-- 3. Generate referral_code for existing users who don't have one
UPDATE users SET referral_code = 'PK' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6))
WHERE referral_code IS NULL;
