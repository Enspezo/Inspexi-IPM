-- AlterTable
ALTER TABLE "imp_organizations" ADD COLUMN     "ai_agent_allowed_roles" "Role"[] DEFAULT ARRAY[]::"Role"[],
ADD COLUMN     "ai_agent_enabled" BOOLEAN NOT NULL DEFAULT true;
