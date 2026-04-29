-- AlterTable
ALTER TABLE "imp_contact_addresses" ADD COLUMN     "is_invoice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_postal" BOOLEAN NOT NULL DEFAULT false;
