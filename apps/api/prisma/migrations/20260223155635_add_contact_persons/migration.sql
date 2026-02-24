-- CreateEnum
CREATE TYPE "ContactPersonRole" AS ENUM ('ALGEMEEN', 'TECHNISCH', 'ADMINISTRATIEF', 'ANDERS');

-- CreateTable
CREATE TABLE "imp_contact_persons" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" "ContactPersonRole" NOT NULL DEFAULT 'ALGEMEEN',
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_contact_persons_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "imp_contact_persons" ADD CONSTRAINT "imp_contact_persons_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_contact_persons" ADD CONSTRAINT "imp_contact_persons_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
