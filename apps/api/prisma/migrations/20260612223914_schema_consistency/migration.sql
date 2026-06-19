-- Schema consistency (Stap 6 — database-optimization-plan)

-- ContactCustomerGroup: surrogate id + unique -> composite primary key
DROP INDEX IF EXISTS "imp_contact_customer_groups_contact_id_customer_group_id_key";
ALTER TABLE "imp_contact_customer_groups" DROP CONSTRAINT "imp_contact_customer_groups_pkey";
ALTER TABLE "imp_contact_customer_groups" DROP COLUMN "id";
ALTER TABLE "imp_contact_customer_groups" ADD CONSTRAINT "imp_contact_customer_groups_pkey" PRIMARY KEY ("contact_id", "customer_group_id");

-- updatedAt columns on existing CRM tables (backfill via default, then drop default — @updatedAt has no DB default)
ALTER TABLE "imp_contacts" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "imp_contact_addresses" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "imp_contact_persons" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "imp_locations" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "imp_contacts" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "imp_contact_addresses" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "imp_contact_persons" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "imp_locations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- PlanningSession reschedule tracking columns -> uuid
-- Preflight: abort bij non-null waarden die geen geldige UUID zijn (de cast zou anders de deploy afbreken zonder context)
DO $$
DECLARE
    cnt BIGINT;
BEGIN
    SELECT count(*) INTO cnt
    FROM "imp_planning_sessions"
    WHERE ("replaced_by_id" IS NOT NULL AND "replaced_by_id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       OR ("replaces_id"    IS NOT NULL AND "replaces_id"    !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
    IF cnt > 0 THEN
        RAISE EXCEPTION 'Migratie afgebroken: % rij(en) in imp_planning_sessions hebben een ongeldige UUID in replaced_by_id/replaces_id — corrigeer of NULL de waarden eerst', cnt;
    END IF;
END $$;
ALTER TABLE "imp_planning_sessions" ALTER COLUMN "replaced_by_id" SET DATA TYPE UUID USING "replaced_by_id"::uuid;
ALTER TABLE "imp_planning_sessions" ALTER COLUMN "replaces_id" SET DATA TYPE UUID USING "replaces_id"::uuid;
