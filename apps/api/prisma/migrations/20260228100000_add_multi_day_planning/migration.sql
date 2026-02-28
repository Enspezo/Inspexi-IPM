-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('NOG_TE_PLANNEN', 'CONCEPT', 'DEFINITIEF', 'AFGEROND', 'VERVALLEN');

-- AlterTable: add multi-day fields to imp_planning_items
ALTER TABLE "imp_planning_items" ADD COLUMN "is_multi_day" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "imp_planning_items" ADD COLUMN "session_count" INTEGER;

-- CreateTable: imp_planning_sessions
CREATE TABLE "imp_planning_sessions" (
    "id" UUID NOT NULL,
    "planning_item_id" UUID NOT NULL,
    "session_number" INTEGER NOT NULL,
    "scheduled_date" TIMESTAMP(3),
    "duration_hours" DOUBLE PRECISION,
    "status" "SessionStatus" NOT NULL DEFAULT 'NOG_TE_PLANNEN',
    "notes" TEXT,
    "is_definitief" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" UUID,
    "replaced_by_id" TEXT,
    "replaces_id" TEXT,
    "original_date" TIMESTAMP(3),
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_planning_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: imp_planning_session_inspectors
CREATE TABLE "imp_planning_session_inspectors" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "acceptance_status" "AcceptanceStatus" NOT NULL DEFAULT 'PENDING',
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_note" TEXT,

    CONSTRAINT "imp_planning_session_inspectors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_planning_sessions_planning_item_id_session_number_idx" ON "imp_planning_sessions"("planning_item_id", "session_number");

-- CreateIndex
CREATE INDEX "imp_planning_sessions_planning_item_id_scheduled_date_idx" ON "imp_planning_sessions"("planning_item_id", "scheduled_date");

-- CreateIndex
CREATE UNIQUE INDEX "imp_planning_session_inspectors_session_id_user_id_key" ON "imp_planning_session_inspectors"("session_id", "user_id");

-- CreateIndex
CREATE INDEX "imp_planning_session_inspectors_session_id_idx" ON "imp_planning_session_inspectors"("session_id");

-- AddForeignKey
ALTER TABLE "imp_planning_sessions" ADD CONSTRAINT "imp_planning_sessions_planning_item_id_fkey" FOREIGN KEY ("planning_item_id") REFERENCES "imp_planning_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_session_inspectors" ADD CONSTRAINT "imp_planning_session_inspectors_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "imp_planning_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_session_inspectors" ADD CONSTRAINT "imp_planning_session_inspectors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
