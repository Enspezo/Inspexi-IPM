-- AlterTable: Add contact_person_id to imp_planning_items
ALTER TABLE "imp_planning_items" ADD COLUMN "contact_person_id" UUID;

-- AddForeignKey
ALTER TABLE "imp_planning_items" ADD CONSTRAINT "imp_planning_items_contact_person_id_fkey" FOREIGN KEY ("contact_person_id") REFERENCES "imp_contact_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
