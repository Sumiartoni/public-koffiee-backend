-- =============================================
-- MIGRATION: OTP Security Layer (Level 1)
-- Run once in Neon Dashboard SQL Editor
--
-- NOTE: user_devices already exists from migration-refine-system.sql
-- This migration only adds otp_codes and user_sessions
-- =============================================

-- 1. OTP CODES TABLE (new)
CREATE TABLE IF NOT EXISTS otp_codes (
    id SERIAL PRIMARY KEY,
    phone TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    expired_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    device_id TEXT,
    request_ip TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_otp_codes_created_at ON otp_codes(created_at);

-- 2. USER SESSIONS TABLE (new)
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT,
    token TEXT NOT NULL,
    expired_at TIMESTAMP NOT NULL,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_device_id ON user_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);

-- 3. Pastikan index user_id di user_devices ada (safe to re-run)
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);

-- 4. Add is_suspicious to users (for future Level 2 hardening)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspicious BOOLEAN DEFAULT FALSE;
