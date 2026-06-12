-- Money fields from double precision to numeric(12,2) (Stap 2 — database-optimization-plan)

-- Preflight: abort bij niet-finite waarden (NaN/Infinity) of waarden die na afronding
-- niet in DECIMAL(12,2) passen. Afronding naar 2 decimalen zelf is bedoeld gedrag.
DO $$
DECLARE
    t RECORD;
    cnt BIGINT;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        ('imp_quotes', 'subtotal'),
        ('imp_quotes', 'discount_total'),
        ('imp_quotes', 'vat_total'),
        ('imp_quotes', 'total'),
        ('imp_quote_lines', 'unit_price'),
        ('imp_quote_lines', 'line_total'),
        ('imp_work_order_lines', 'unit_price'),
        ('imp_work_order_lines', 'line_total'),
        ('imp_price_tiers', 'price'),
        ('imp_price_table_items', 'base_price')
    ) AS v(tbl, col)
    LOOP
        EXECUTE format(
            'SELECT count(*) FROM %I WHERE %I IS NOT NULL AND (%I::text IN (''NaN'', ''Infinity'', ''-Infinity'') OR ROUND(ABS(%I)::numeric, 2) >= 10000000000)',
            t.tbl, t.col, t.col, t.col
        ) INTO cnt;
        IF cnt > 0 THEN
            RAISE EXCEPTION 'Migratie afgebroken: % rij(en) in %.% zijn niet-finite of passen niet in DECIMAL(12,2) — corrigeer de data eerst', cnt, t.tbl, t.col;
        END IF;
    END LOOP;
END $$;

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
