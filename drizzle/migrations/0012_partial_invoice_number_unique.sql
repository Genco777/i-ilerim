-- Drop the blanket unique constraint and replace with partial index.
-- Cancelled & deleted invoices can share numbers with active ones.
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_number_unique";
DROP INDEX IF EXISTS "invoices_number_unique_active";
CREATE UNIQUE INDEX "invoices_number_unique_active" ON "invoices" ("number") WHERE "status" NOT IN ('cancelled', 'deleted');
