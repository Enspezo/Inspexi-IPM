-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('COMPANY', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('EMAIL', 'PHONE', 'MEETING', 'NOTE');

-- CreateTable
CREATE TABLE "imp_contacts" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "type" "ContactType" NOT NULL,
    "company_name" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "vat_number" TEXT,
    "coc_number" TEXT,
    "notes" TEXT,
    "price_table_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_contact_addresses" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "house_number" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'NL',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "imp_contact_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_locations" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "house_number" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "object_type" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_contact_logs" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "LogType" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_contact_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_contact_emails" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "resend_id" TEXT,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3),

    CONSTRAINT "imp_contact_emails_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "imp_contacts" ADD CONSTRAINT "imp_contacts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_contact_addresses" ADD CONSTRAINT "imp_contact_addresses_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_locations" ADD CONSTRAINT "imp_locations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_locations" ADD CONSTRAINT "imp_locations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_contact_logs" ADD CONSTRAINT "imp_contact_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_contact_logs" ADD CONSTRAINT "imp_contact_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_contact_emails" ADD CONSTRAINT "imp_contact_emails_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_contact_emails" ADD CONSTRAINT "imp_contact_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
