-- CreateTable
CREATE TABLE "imp_client_refresh_tokens" (
    "id" UUID NOT NULL,
    "client_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_client_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_client_refresh_tokens_client_user_id_idx" ON "imp_client_refresh_tokens"("client_user_id");

-- CreateIndex
CREATE INDEX "imp_client_refresh_tokens_expires_at_idx" ON "imp_client_refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "imp_client_refresh_tokens_token_hash_idx" ON "imp_client_refresh_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "imp_client_refresh_tokens" ADD CONSTRAINT "imp_client_refresh_tokens_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "imp_client_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
