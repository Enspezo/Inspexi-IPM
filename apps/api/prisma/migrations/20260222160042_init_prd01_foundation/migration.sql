-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERUSER', 'ORG_ADMIN', 'MANAGER', 'BACKOFFICE', 'WERKVOORBEREIDER', 'INSPECTEUR');

-- CreateTable
CREATE TABLE "imp_organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "primary_color" TEXT,
    "default_vat" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "default_validity_days" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_users" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "imp_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_invitations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_organizations_slug_key" ON "imp_organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "imp_users_email_key" ON "imp_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "imp_invitations_token_key" ON "imp_invitations"("token");

-- AddForeignKey
ALTER TABLE "imp_users" ADD CONSTRAINT "imp_users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_refresh_tokens" ADD CONSTRAINT "imp_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_invitations" ADD CONSTRAINT "imp_invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
