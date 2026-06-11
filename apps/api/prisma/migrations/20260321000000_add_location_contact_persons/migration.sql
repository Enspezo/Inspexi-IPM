-- CreateTable
CREATE TABLE "imp_location_contact_persons" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "contact_person_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_location_contact_persons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_location_contact_persons_location_id_contact_person_id_key" ON "imp_location_contact_persons"("location_id", "contact_person_id");

-- AddForeignKey
ALTER TABLE "imp_location_contact_persons" ADD CONSTRAINT "imp_location_contact_persons_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "imp_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_contact_persons" ADD CONSTRAINT "imp_location_contact_persons_contact_person_id_fkey" FOREIGN KEY ("contact_person_id") REFERENCES "imp_contact_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_contact_persons" ADD CONSTRAINT "imp_location_contact_persons_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
