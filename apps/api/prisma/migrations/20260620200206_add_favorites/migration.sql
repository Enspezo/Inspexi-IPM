-- CreateTable
CREATE TABLE "imp_favorites" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_favorites_user_id_idx" ON "imp_favorites"("user_id");

-- CreateIndex
CREATE INDEX "imp_favorites_org_id_idx" ON "imp_favorites"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_favorites_user_id_entity_type_entity_id_key" ON "imp_favorites"("user_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "imp_favorites" ADD CONSTRAINT "imp_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_favorites" ADD CONSTRAINT "imp_favorites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
