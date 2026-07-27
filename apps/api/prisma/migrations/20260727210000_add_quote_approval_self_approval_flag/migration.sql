-- AlterTable (WP-B5 / B-307): vier-ogen op offertes — org-vlag die self-approval van
-- het eigen goedkeuringsverzoek toestaat. Puur additief (kolom met default).
ALTER TABLE "imp_organizations" ADD COLUMN     "quote_approval_self_approval_allowed" BOOLEAN NOT NULL DEFAULT false;
