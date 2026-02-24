-- Add source column to identify where the order came from
-- Default is 'web' to maintain existing behavior for frontend-public
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web';
