-- IMPORTANT: Replace [DB_USER] with the actual database username used by your application (check .env file)
-- Example: 'postgres', 'koffie_user', 'u123456_dbuser', etc.

-- 1. Fix Customer Vouchers Permissions
GRANT ALL PRIVILEGES ON TABLE customer_vouchers TO [DB_USER];
GRANT ALL PRIVILEGES ON SEQUENCE customer_vouchers_id_seq TO [DB_USER];

-- 2. Fix Notification Tables (Just in case)
GRANT ALL PRIVILEGES ON TABLE notifications TO [DB_USER];
GRANT ALL PRIVILEGES ON SEQUENCE notifications_id_seq TO [DB_USER];

GRANT ALL PRIVILEGES ON TABLE user_notifications TO [DB_USER];
GRANT ALL PRIVILEGES ON SEQUENCE user_notifications_id_seq TO [DB_USER];

-- 3. Fix User Vouchers (If needed)
GRANT ALL PRIVILEGES ON TABLE user_vouchers TO [DB_USER];
GRANT ALL PRIVILEGES ON SEQUENCE user_vouchers_id_seq TO [DB_USER];

-- 4. General fallback (Applies to all tables, safer for broad access)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO [DB_USER];
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO [DB_USER];
