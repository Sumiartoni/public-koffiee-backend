-- Add discount_type and discount_amount to customer_vouchers
ALTER TABLE customer_vouchers 
ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
ADD COLUMN IF NOT EXISTS discount_amount INTEGER DEFAULT 0;
