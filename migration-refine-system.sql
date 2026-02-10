-- 1. Modify Users Table
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT;

-- 2. Drop existing tables to ensure clean slate
DROP TABLE IF EXISTS user_vouchers CASCADE;
DROP TABLE IF EXISTS customer_vouchers CASCADE;

-- 3. Customer Vouchers (Master)
CREATE TABLE customer_vouchers (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('new_user', 'referral', 'general')),
  type TEXT NOT NULL CHECK (type IN ('percent', 'nominal')),
  value INTEGER NOT NULL,
  max_discount INTEGER, -- Nullable
  min_purchase INTEGER DEFAULT 0,
  quota INTEGER, -- Nullable
  validity_days INTEGER DEFAULT 0, -- Set berapa hari dari awal klaim (User Requirement)
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. User Vouchers (Claimed)
CREATE TABLE user_vouchers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  voucher_id INTEGER NOT NULL REFERENCES customer_vouchers(id),
  device_id TEXT, -- Nullable
  is_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. User Devices
CREATE TABLE IF NOT EXISTS user_devices (
  id SERIAL PRIMARY KEY,
  device_id TEXT UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id),
  first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_device_id ON user_devices(device_id);

-- 6. Referral Rewards
CREATE TABLE IF NOT EXISTS referral_rewards (
  id SERIAL PRIMARY KEY,
  referrer_id INTEGER NOT NULL REFERENCES users(id),
  referred_id INTEGER NOT NULL REFERENCES users(id),
  reward_given BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
