-- AlterTable
ALTER TABLE "imp_locations" ADD COLUMN     "bag_id" TEXT,
ADD COLUMN     "bouwjaar" INTEGER,
ADD COLUMN     "gebruiksfunctie" TEXT,
ADD COLUMN     "oppervlakte" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "imp_pdok_api_logs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID,
    "location_id" UUID,
    "operation" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request_params" JSONB,
    "http_status" INTEGER,
    "success" BOOLEAN NOT NULL,
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_pdok_api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_pdok_api_logs_org_id_created_at_idx" ON "imp_pdok_api_logs"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "imp_pdok_api_logs_location_id_idx" ON "imp_pdok_api_logs"("location_id");

-- AddForeignKey
ALTER TABLE "imp_pdok_api_logs" ADD CONSTRAINT "imp_pdok_api_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
