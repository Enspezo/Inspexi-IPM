-- CreateEnum
CREATE TYPE "RequestSource" AS ENUM ('MANUAL', 'WEB_FORM', 'EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NIEUW', 'IN_BEHANDELING', 'OFFERTE_GEMAAKT', 'GEWONNEN', 'VERLOREN', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateTable
CREATE TABLE "imp_requests" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "location_id" UUID,
    "assigned_to" UUID,
    "source" "RequestSource" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'NIEUW',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "created_by" UUID NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_request_status_history" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "from_status" "RequestStatus",
    "to_status" "RequestStatus" NOT NULL,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "imp_request_status_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "imp_requests" ADD CONSTRAINT "imp_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_requests" ADD CONSTRAINT "imp_requests_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_requests" ADD CONSTRAINT "imp_requests_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "imp_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_requests" ADD CONSTRAINT "imp_requests_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_requests" ADD CONSTRAINT "imp_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_request_status_history" ADD CONSTRAINT "imp_request_status_history_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "imp_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_request_status_history" ADD CONSTRAINT "imp_request_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
