-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_TICKET_AANGEMAAKT';
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_TICKET_REACTIE';
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_TICKET_STATUS';

-- NB: prisma migrate dev wilde hier de pg_trgm/GIN-indexen van het helpsysteem
-- (idx_help_articles_*_trgm, idx_help_articles_module_keys) droppen. Die zijn
-- bewust via raw SQL aangemaakt (20260623214008_help_trigram_search) en staan
-- niet in schema.prisma, dus Prisma ziet ze als drift. Niet droppen — de
-- DROP INDEX-statements zijn daarom verwijderd zodat de KB-zoekindexen blijven.
