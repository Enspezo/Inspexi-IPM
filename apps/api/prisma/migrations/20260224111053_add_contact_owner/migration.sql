-- AlterTable
ALTER TABLE "imp_contacts" ADD COLUMN     "owner_id" UUID;

-- AddForeignKey
ALTER TABLE "imp_contacts" ADD CONSTRAINT "imp_contacts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
