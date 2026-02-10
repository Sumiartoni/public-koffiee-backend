-- Customer Vouchers Table
CREATE TABLE IF NOT EXISTS customer_vouchers (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('new_user', 'referral', 'general')),
  name TEXT NOT NULL,
  description TEXT,
  
  -- Logic Fields
  discount_percentage INTEGER DEFAULT 0, -- For referral/general
  max_discount INTEGER DEFAULT 0, -- Max cap for percentage
  min_purchase INTEGER DEFAULT 0, 
  
  -- Specifics
  validity_days INTEGER DEFAULT 0, -- Valid for X days after claim
  quota INTEGER DEFAULT 0, -- Max total claims (0 = unlimited)
  
  -- Referral Specifics
  allowed_category_id INTEGER REFERENCES categories(id), -- Only valid for specific category
  
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Vouchers (Claimed/Assigned)
CREATE TABLE IF NOT EXISTS user_vouchers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  voucher_id INTEGER REFERENCES customer_vouchers(id),
  
  code TEXT UNIQUE, -- Unique code generated upon claim
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  
  claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL, -- Calculated based on claim date + validity_days
  used_at TIMESTAMP,
  order_id INTEGER REFERENCES orders(id) -- Linked to order when used
);
