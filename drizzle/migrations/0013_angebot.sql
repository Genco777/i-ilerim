ALTER TYPE invoice_type ADD VALUE IF NOT EXISTS 'angebot';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'converted';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS valid_until TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS converted_to_invoice_id TEXT;
