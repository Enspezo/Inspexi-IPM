-- CreateTable
CREATE TABLE "imp_customer_groups" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_contact_customer_groups" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "customer_group_id" UUID NOT NULL,

    CONSTRAINT "imp_contact_customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_contact_customer_groups_contact_id_customer_group_id_key" ON "imp_contact_customer_groups"("contact_id", "customer_group_id");

-- AddForeignKey
ALTER TABLE "imp_customer_groups" ADD CONSTRAINT "imp_customer_groups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_contact_customer_groups" ADD CONSTRAINT "imp_contact_customer_groups_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_contact_customer_groups" ADD CONSTRAINT "imp_contact_customer_groups_customer_group_id_fkey" FOREIGN KEY ("customer_group_id") REFERENCES "imp_customer_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
