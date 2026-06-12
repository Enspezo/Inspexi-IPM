-- Convert LostReason & ContactPersonRole enums to lookup tables
-- Strategy: create tables → seed global defaults → add FK columns →
-- backfill from old enum text → drop old columns → add FKs → drop enum types.

-- ─── 1. Lookup tables ────────────────────────────────────

CREATE TABLE "imp_lost_reasons" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "imp_lost_reasons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "imp_contact_person_roles" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "imp_contact_person_roles_pkey" PRIMARY KEY ("id")
);

-- Unieke index per (org_id, code); komt overeen met Prisma @@unique([orgId, code])
CREATE UNIQUE INDEX "imp_lost_reasons_org_id_code_key"
    ON "imp_lost_reasons" ("org_id", "code");
CREATE INDEX "imp_lost_reasons_org_id_is_active_idx"
    ON "imp_lost_reasons" ("org_id", "is_active");

CREATE UNIQUE INDEX "imp_contact_person_roles_org_id_code_key"
    ON "imp_contact_person_roles" ("org_id", "code");
CREATE INDEX "imp_contact_person_roles_org_id_is_active_idx"
    ON "imp_contact_person_roles" ("org_id", "is_active");

-- ─── 2. Seed globale defaults (org_id NULL, code = oude enum-waarde) ──

INSERT INTO "imp_lost_reasons" ("id", "org_id", "code", "label", "sort_order", "is_system") VALUES
    (gen_random_uuid(), NULL, 'TE_DUUR',              'Te duur',              10, true),
    (gen_random_uuid(), NULL, 'GEEN_BESCHIKBAARHEID', 'Geen beschikbaarheid', 20, true),
    (gen_random_uuid(), NULL, 'NIET_LANGER_NODIG',    'Niet langer nodig',    30, true),
    (gen_random_uuid(), NULL, 'ANDERS',               'Anders',               40, true);

INSERT INTO "imp_contact_person_roles" ("id", "org_id", "code", "label", "sort_order", "is_system") VALUES
    (gen_random_uuid(), NULL, 'ALGEMEEN',       'Algemeen',       10, true),
    (gen_random_uuid(), NULL, 'TECHNISCH',      'Technisch',      20, true),
    (gen_random_uuid(), NULL, 'ADMINISTRATIEF', 'Administratief', 30, true),
    (gen_random_uuid(), NULL, 'ANDERS',         'Anders',         40, true);

-- ─── 3. Nieuwe FK-kolommen ───────────────────────────────

ALTER TABLE "imp_requests"         ADD COLUMN "lost_reason_id" UUID;
-- lost_note zat al via `db push` in bestaande databases maar in geen enkele migratie
ALTER TABLE "imp_requests"         ADD COLUMN IF NOT EXISTS "lost_note" TEXT;
ALTER TABLE "imp_contact_persons"  ADD COLUMN "role_id"        UUID;

-- ─── 4. Backfill bestaande rijen (enum-tekst → lookup-rij) ──

-- NB: "lost_reason" bestond alleen in databases die via `db push` zijn bijgewerkt —
-- geen eerdere migratie maakt deze kolom aan. Conditioneel backfillen zodat de
-- keten ook op een lege (shadow) database herspeelt.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'imp_requests' AND column_name = 'lost_reason'
    ) THEN
        UPDATE "imp_requests" r
        SET "lost_reason_id" = lr."id"
        FROM "imp_lost_reasons" lr
        WHERE lr."org_id" IS NULL
          AND lr."code" = r."lost_reason"::text
          AND r."lost_reason" IS NOT NULL;
    END IF;
END $$;

UPDATE "imp_contact_persons" cp
SET "role_id" = o."id"
FROM "imp_contact_person_roles" o
WHERE o."org_id" IS NULL
  AND o."code" = cp."role"::text;

-- ─── 5. Oude enum-kolommen verwijderen ───────────────────

ALTER TABLE "imp_requests"        DROP COLUMN IF EXISTS "lost_reason";
ALTER TABLE "imp_contact_persons" DROP COLUMN "role";

-- ─── 6. Foreign keys ─────────────────────────────────────

ALTER TABLE "imp_lost_reasons"
    ADD CONSTRAINT "imp_lost_reasons_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "imp_contact_person_roles"
    ADD CONSTRAINT "imp_contact_person_roles_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "imp_requests"
    ADD CONSTRAINT "imp_requests_lost_reason_id_fkey"
    FOREIGN KEY ("lost_reason_id") REFERENCES "imp_lost_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "imp_contact_persons"
    ADD CONSTRAINT "imp_contact_persons_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "imp_contact_person_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 7. Oude enum-types verwijderen ──────────────────────

DROP TYPE IF EXISTS "LostReason";
DROP TYPE "ContactPersonRole";
