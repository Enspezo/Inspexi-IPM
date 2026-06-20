-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('THRESHOLD', 'VOLUNTARY_TEAM', 'VOLUNTARY_PERSON');

-- AlterEnum
ALTER TYPE "ApprovalStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'OFFERTE_GOEDKEURING_GEVRAAGD_TEAM';
ALTER TYPE "NotificationType" ADD VALUE 'OFFERTE_GOEDKEURING_GEVRAAGD_PERSOON';
ALTER TYPE "NotificationType" ADD VALUE 'OFFERTE_GOEDKEURING_AFGEHANDELD';

-- AlterTable
ALTER TABLE "imp_organizations" ADD COLUMN     "quote_approval_required_role" "Role",
ADD COLUMN     "quote_approval_threshold" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "imp_quote_approval_requests" ADD COLUMN     "approver_role" "Role",
ADD COLUMN     "approver_user_id" UUID,
ADD COLUMN     "kind" "ApprovalKind" NOT NULL DEFAULT 'THRESHOLD';

-- AlterTable
ALTER TABLE "imp_users" ADD COLUMN     "default_approval_person_id" UUID;

-- AddForeignKey
ALTER TABLE "imp_users" ADD CONSTRAINT "imp_users_default_approval_person_id_fkey" FOREIGN KEY ("default_approval_person_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_approval_requests" ADD CONSTRAINT "imp_quote_approval_requests_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
