-- CreateEnum
CREATE TYPE "ContactDisplayMode" AS ENUM ('NONE', 'STATIC', 'INSPECTOR');

-- AlterTable
ALTER TABLE "imp_organizations" ADD COLUMN     "inspector_email_display" "ContactDisplayMode" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "inspector_phone_display" "ContactDisplayMode" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "inspector_static_email" TEXT,
ADD COLUMN     "inspector_static_phone" TEXT;

-- AlterTable
ALTER TABLE "imp_users" ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "share_email_with_clients" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "share_phone_with_clients" BOOLEAN NOT NULL DEFAULT false;
