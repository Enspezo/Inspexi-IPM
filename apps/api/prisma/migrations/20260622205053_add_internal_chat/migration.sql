-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('BESCHIKBAAR', 'BEZIG', 'AFWEZIG', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ChatThreadType" AS ENUM ('DIRECT', 'TEAM');

-- CreateEnum
CREATE TYPE "ChatThreadStatus" AS ENUM ('OPEN', 'AFGEROND');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CHAT_BERICHT';
ALTER TYPE "NotificationType" ADD VALUE 'CHAT_TEAM_BERICHT';
ALTER TYPE "NotificationType" ADD VALUE 'CHAT_MENTION';

-- AlterTable
ALTER TABLE "imp_users" ADD COLUMN     "availability" "Availability" NOT NULL DEFAULT 'BESCHIKBAAR',
ADD COLUMN     "availability_note" TEXT,
ADD COLUMN     "last_seen_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "imp_chat_threads" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "type" "ChatThreadType" NOT NULL,
    "team_role" "Role",
    "direct_key" TEXT,
    "subject" TEXT,
    "reference_entity_type" TEXT,
    "reference_entity_id" UUID,
    "status" "ChatThreadStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "note_id" UUID,
    "created_by_id" UUID NOT NULL,
    "device_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "imp_chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_chat_participants" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_chat_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_chat_messages" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "mentioned_user_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "reference_entity_type" TEXT,
    "reference_entity_id" UUID,
    "device_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "imp_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_chat_threads_org_id_type_idx" ON "imp_chat_threads"("org_id", "type");

-- CreateIndex
CREATE INDEX "imp_chat_threads_org_id_deleted_at_idx" ON "imp_chat_threads"("org_id", "deleted_at");

-- CreateIndex
CREATE INDEX "imp_chat_threads_reference_entity_type_reference_entity_id_idx" ON "imp_chat_threads"("reference_entity_type", "reference_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_chat_threads_org_id_team_role_key" ON "imp_chat_threads"("org_id", "team_role");

-- CreateIndex
CREATE UNIQUE INDEX "imp_chat_threads_org_id_direct_key_key" ON "imp_chat_threads"("org_id", "direct_key");

-- CreateIndex
CREATE INDEX "imp_chat_participants_user_id_idx" ON "imp_chat_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_chat_participants_thread_id_user_id_key" ON "imp_chat_participants"("thread_id", "user_id");

-- CreateIndex
CREATE INDEX "imp_chat_messages_thread_id_created_at_idx" ON "imp_chat_messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "imp_chat_messages_org_id_deleted_at_idx" ON "imp_chat_messages"("org_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "imp_chat_threads" ADD CONSTRAINT "imp_chat_threads_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_chat_threads" ADD CONSTRAINT "imp_chat_threads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_chat_participants" ADD CONSTRAINT "imp_chat_participants_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "imp_chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_chat_participants" ADD CONSTRAINT "imp_chat_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_chat_messages" ADD CONSTRAINT "imp_chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "imp_chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_chat_messages" ADD CONSTRAINT "imp_chat_messages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_chat_messages" ADD CONSTRAINT "imp_chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
