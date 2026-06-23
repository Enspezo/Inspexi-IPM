-- AddForeignKey
ALTER TABLE "imp_organization_features" ADD CONSTRAINT "imp_organization_features_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
