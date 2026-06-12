-- Money fields from double precision to numeric(12,2) (Stap 2 — database-optimization-plan)

-- AlterTable imp_quotes
ALTER TABLE "imp_quotes" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "imp_quotes" ALTER COLUMN "discount_total" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "imp_quotes" ALTER COLUMN "vat_total" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "imp_quotes" ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable imp_quote_lines
ALTER TABLE "imp_quote_lines" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "imp_quote_lines" ALTER COLUMN "line_total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable imp_work_order_lines
ALTER TABLE "imp_work_order_lines" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "imp_work_order_lines" ALTER COLUMN "line_total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable imp_price_tiers
ALTER TABLE "imp_price_tiers" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable imp_price_table_items
ALTER TABLE "imp_price_table_items" ALTER COLUMN "base_price" SET DATA TYPE DECIMAL(12,2);
