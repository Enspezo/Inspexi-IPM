-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('CONCEPT', 'TER_GOEDKEURING', 'GOEDGEKEURD', 'VERSTUURD', 'BEKEKEN', 'GEACCEPTEERD', 'AFGEWEZEN', 'VERLOPEN');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "imp_quote_templates" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cover_blocks" JSONB,
    "content_blocks" JSONB,
    "closing_blocks" JSONB,
    "default_validity_days" INTEGER NOT NULL DEFAULT 30,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_quote_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_quotes" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "quote_number" TEXT NOT NULL,
    "template_id" UUID,
    "request_id" UUID,
    "contact_id" UUID NOT NULL,
    "location_id" UUID,
    "status" "QuoteStatus" NOT NULL DEFAULT 'CONCEPT',
    "subject" TEXT NOT NULL,
    "cover_blocks" JSONB,
    "content_blocks" JSONB,
    "closing_blocks" JSONB,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valid_until" TIMESTAMP(3),
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "internal_notes" TEXT,
    "created_by" UUID NOT NULL,
    "sent_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "client_signature" TEXT,
    "client_ip" TEXT,
    "client_user_agent" TEXT,
    "manager_signature" TEXT,
    "public_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_quote_lines" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "product_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "vat_rate" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "discount_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "line_total" DOUBLE PRECISION NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "imp_quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_quote_approval_requests" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "imp_quote_approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_quotes_quote_number_key" ON "imp_quotes"("quote_number");

-- CreateIndex
CREATE UNIQUE INDEX "imp_quotes_public_token_key" ON "imp_quotes"("public_token");

-- AddForeignKey
ALTER TABLE "imp_quote_templates" ADD CONSTRAINT "imp_quote_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quotes" ADD CONSTRAINT "imp_quotes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quotes" ADD CONSTRAINT "imp_quotes_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "imp_quote_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quotes" ADD CONSTRAINT "imp_quotes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "imp_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quotes" ADD CONSTRAINT "imp_quotes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quotes" ADD CONSTRAINT "imp_quotes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "imp_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quotes" ADD CONSTRAINT "imp_quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_lines" ADD CONSTRAINT "imp_quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "imp_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_lines" ADD CONSTRAINT "imp_quote_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "imp_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_approval_requests" ADD CONSTRAINT "imp_quote_approval_requests_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "imp_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_approval_requests" ADD CONSTRAINT "imp_quote_approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_approval_requests" ADD CONSTRAINT "imp_quote_approval_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
