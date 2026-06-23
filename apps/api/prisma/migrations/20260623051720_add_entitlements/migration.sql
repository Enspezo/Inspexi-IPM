-- AlterTable
ALTER TABLE "imp_organizations" ADD COLUMN     "plan_id" UUID;

-- CreateTable
CREATE TABLE "imp_plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_plan_features" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "feature_key" TEXT NOT NULL,

    CONSTRAINT "imp_plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_organization_features" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "feature_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_organization_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_plans_slug_key" ON "imp_plans"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "imp_plan_features_plan_id_feature_key_key" ON "imp_plan_features"("plan_id", "feature_key");

-- CreateIndex
CREATE UNIQUE INDEX "imp_organization_features_org_id_feature_key_key" ON "imp_organization_features"("org_id", "feature_key");

-- AddForeignKey
ALTER TABLE "imp_organizations" ADD CONSTRAINT "imp_organizations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "imp_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_plan_features" ADD CONSTRAINT "imp_plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "imp_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_organization_features" ADD CONSTRAINT "imp_organization_features_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
