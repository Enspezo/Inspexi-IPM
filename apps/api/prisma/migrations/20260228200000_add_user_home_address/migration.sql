-- AlterTable
ALTER TABLE "imp_users" ADD COLUMN "home_street" TEXT;
ALTER TABLE "imp_users" ADD COLUMN "home_house_number" TEXT;
ALTER TABLE "imp_users" ADD COLUMN "home_postal_code" TEXT;
ALTER TABLE "imp_users" ADD COLUMN "home_city" TEXT;
ALTER TABLE "imp_users" ADD COLUMN "home_lat" DOUBLE PRECISION;
ALTER TABLE "imp_users" ADD COLUMN "home_lng" DOUBLE PRECISION;
