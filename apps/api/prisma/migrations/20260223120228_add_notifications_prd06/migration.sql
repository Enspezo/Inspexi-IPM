-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('OFFERTE_TER_GOEDKEURING', 'OFFERTE_GOEDGEKEURD', 'OFFERTE_AFGEWEZEN', 'OFFERTE_VERSTUURD', 'OFFERTE_BEKEKEN', 'OFFERTE_ONDERTEKEND', 'OFFERTE_VERLOPEN', 'NIEUWE_VRAAG_KLANT', 'ANTWOORD_OP_VRAAG', 'AANVRAAG_TOEGEWEZEN', 'AANVRAAG_STATUS_GEWIJZIGD');

-- CreateTable
CREATE TABLE "imp_notifications" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_notification_prefs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "notification_type" "NotificationType" NOT NULL,
    "channel_in_app" BOOLEAN NOT NULL DEFAULT true,
    "channel_email" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "imp_notification_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_notification_group_prefs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "notification_type" "NotificationType" NOT NULL,
    "channel_in_app" BOOLEAN NOT NULL DEFAULT true,
    "channel_email" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "imp_notification_group_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_notification_prefs_user_id_notification_type_key" ON "imp_notification_prefs"("user_id", "notification_type");

-- CreateIndex
CREATE UNIQUE INDEX "imp_notification_group_prefs_org_id_role_notification_type_key" ON "imp_notification_group_prefs"("org_id", "role", "notification_type");

-- AddForeignKey
ALTER TABLE "imp_notifications" ADD CONSTRAINT "imp_notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_notifications" ADD CONSTRAINT "imp_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_notification_prefs" ADD CONSTRAINT "imp_notification_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_notification_group_prefs" ADD CONSTRAINT "imp_notification_group_prefs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
