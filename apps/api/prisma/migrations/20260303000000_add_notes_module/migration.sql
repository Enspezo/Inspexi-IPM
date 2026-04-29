-- CreateTable
CREATE TABLE "imp_notes" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "entity_type" "NoteEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "parent_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_notes_org_id_entity_type_entity_id_idx" ON "imp_notes"("org_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "imp_notes_parent_id_idx" ON "imp_notes"("parent_id");

-- CreateIndex
CREATE INDEX "imp_notes_created_by_id_idx" ON "imp_notes"("created_by_id");

-- AddForeignKey
ALTER TABLE "imp_notes" ADD CONSTRAINT "imp_notes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_notes" ADD CONSTRAINT "imp_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_notes" ADD CONSTRAINT "imp_notes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "imp_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
