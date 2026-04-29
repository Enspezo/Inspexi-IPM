-- CreateEnum
CREATE TYPE "SignatureType" AS ENUM ('DRAW', 'UPLOAD', 'TEXT');

-- AlterTable
ALTER TABLE "imp_users" ADD COLUMN     "signature_data" TEXT,
ADD COLUMN     "signature_type" "SignatureType";
