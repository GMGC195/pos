-- Fix any currently negative stock quantities first
UPDATE stock SET quantity = 0 WHERE quantity < 0;

-- Add a check constraint to prevent quantity from going negative in the future
ALTER TABLE stock ADD CONSTRAINT stock_quantity_non_negative CHECK (quantity >= 0);

-- Same for stock_history remaining_quantity
ALTER TABLE stock_history ADD CONSTRAINT stock_history_remaining_non_negative CHECK (remaining_quantity >= 0);
