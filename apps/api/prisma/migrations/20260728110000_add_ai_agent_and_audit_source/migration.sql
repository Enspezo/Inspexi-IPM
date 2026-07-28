-- CreateEnum
CREATE TYPE "AuditSource" AS ENUM ('HUMAN', 'AI');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AiActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXECUTED', 'FAILED');

-- AlterTable
ALTER TABLE "imp_audit_logs" ADD COLUMN     "source" "AuditSource" NOT NULL DEFAULT 'HUMAN';

-- CreateTable
CREATE TABLE "imp_ai_conversations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "imp_ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_ai_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_ai_pending_actions" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tool_name" TEXT NOT NULL,
    "tool_use_id" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "AiActionStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "audit_log_id" UUID,
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_ai_pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_ai_usage_logs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "conversation_id" UUID,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_ai_conversations_org_id_user_id_updated_at_idx" ON "imp_ai_conversations"("org_id", "user_id", "updated_at");

-- CreateIndex
CREATE INDEX "imp_ai_messages_conversation_id_created_at_idx" ON "imp_ai_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "imp_ai_pending_actions_conversation_id_status_idx" ON "imp_ai_pending_actions"("conversation_id", "status");

-- CreateIndex
CREATE INDEX "imp_ai_pending_actions_org_id_user_id_status_idx" ON "imp_ai_pending_actions"("org_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "imp_ai_usage_logs_org_id_created_at_idx" ON "imp_ai_usage_logs"("org_id", "created_at");

-- AddForeignKey
ALTER TABLE "imp_ai_conversations" ADD CONSTRAINT "imp_ai_conversations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_ai_conversations" ADD CONSTRAINT "imp_ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_ai_messages" ADD CONSTRAINT "imp_ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "imp_ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_ai_pending_actions" ADD CONSTRAINT "imp_ai_pending_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "imp_ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_ai_usage_logs" ADD CONSTRAINT "imp_ai_usage_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
