-- CreateEnum
CREATE TYPE "HelpArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('NIEUW', 'IN_BEHANDELING', 'WACHT_OP_KLANT', 'OPGELOST', 'GESLOTEN');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LAAG', 'NORMAAL', 'HOOG', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportTicketCategory" AS ENUM ('VRAAG', 'PROBLEEM', 'BUG', 'FEATURE_REQUEST', 'FACTUUR', 'OVERIG');

-- CreateEnum
CREATE TYPE "SupportMessageAuthorType" AS ENUM ('USER', 'SUPPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SupportAccessAction" AS ENUM ('ENABLED', 'DISABLED', 'EXPIRED', 'ACCESSED');

-- AlterEnum
ALTER TYPE "DocumentEntityType" ADD VALUE 'SUPPORT_TICKET';

-- AlterTable
ALTER TABLE "imp_organizations" ADD COLUMN     "support_access_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "support_access_expires_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "imp_help_categories" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "parent_id" UUID,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_help_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_help_articles" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "category_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "status" "HelpArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "module_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "helpful_yes" INTEGER NOT NULL DEFAULT 0,
    "helpful_no" INTEGER NOT NULL DEFAULT 0,
    "author_id" UUID,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_help_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_support_tickets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "ticket_number" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'NIEUW',
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAAL',
    "category" "SupportTicketCategory" NOT NULL DEFAULT 'VRAAG',
    "context_module" TEXT,
    "context_url" TEXT,
    "created_by_id" UUID NOT NULL,
    "assigned_to_id" UUID,
    "first_response_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_support_ticket_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "author_id" UUID,
    "author_type" "SupportMessageAuthorType" NOT NULL DEFAULT 'USER',
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_support_access_logs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "action" "SupportAccessAction" NOT NULL,
    "performed_by_id" UUID,
    "performed_by_role" "Role",
    "ip" TEXT,
    "user_agent" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_support_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_help_categories_parent_id_order_idx" ON "imp_help_categories"("parent_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "imp_help_categories_org_id_slug_key" ON "imp_help_categories"("org_id", "slug");

-- CreateIndex
CREATE INDEX "imp_help_articles_org_id_status_idx" ON "imp_help_articles"("org_id", "status");

-- CreateIndex
CREATE INDEX "imp_help_articles_category_id_order_idx" ON "imp_help_articles"("category_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "imp_help_articles_org_id_slug_key" ON "imp_help_articles"("org_id", "slug");

-- CreateIndex
CREATE INDEX "imp_support_tickets_org_id_status_idx" ON "imp_support_tickets"("org_id", "status");

-- CreateIndex
CREATE INDEX "imp_support_tickets_created_by_id_idx" ON "imp_support_tickets"("created_by_id");

-- CreateIndex
CREATE INDEX "imp_support_tickets_assigned_to_id_idx" ON "imp_support_tickets"("assigned_to_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_support_tickets_org_id_ticket_number_key" ON "imp_support_tickets"("org_id", "ticket_number");

-- CreateIndex
CREATE INDEX "imp_support_ticket_messages_ticket_id_created_at_idx" ON "imp_support_ticket_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "imp_support_access_logs_org_id_created_at_idx" ON "imp_support_access_logs"("org_id", "created_at");

-- AddForeignKey
ALTER TABLE "imp_help_categories" ADD CONSTRAINT "imp_help_categories_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_help_categories" ADD CONSTRAINT "imp_help_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "imp_help_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_help_articles" ADD CONSTRAINT "imp_help_articles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_help_articles" ADD CONSTRAINT "imp_help_articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "imp_help_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_help_articles" ADD CONSTRAINT "imp_help_articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_support_tickets" ADD CONSTRAINT "imp_support_tickets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_support_tickets" ADD CONSTRAINT "imp_support_tickets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_support_tickets" ADD CONSTRAINT "imp_support_tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_support_ticket_messages" ADD CONSTRAINT "imp_support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "imp_support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_support_ticket_messages" ADD CONSTRAINT "imp_support_ticket_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_support_access_logs" ADD CONSTRAINT "imp_support_access_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_support_access_logs" ADD CONSTRAINT "imp_support_access_logs_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
