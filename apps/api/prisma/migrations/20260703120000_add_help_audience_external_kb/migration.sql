-- CreateEnum
CREATE TYPE "HelpAudience" AS ENUM ('INTERNAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "imp_help_articles" ADD COLUMN     "audience" "HelpAudience" NOT NULL DEFAULT 'INTERNAL';

-- AlterTable
ALTER TABLE "imp_help_categories" ADD COLUMN     "audience" "HelpAudience" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "imp_help_articles_org_id_audience_status_idx" ON "imp_help_articles"("org_id", "audience", "status");

-- CreateIndex
CREATE INDEX "imp_help_categories_org_id_audience_idx" ON "imp_help_categories"("org_id", "audience");
