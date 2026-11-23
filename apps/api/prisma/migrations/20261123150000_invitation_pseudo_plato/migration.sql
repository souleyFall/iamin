-- Pseudo Plato attendu d'une invitation : le propriétaire sait qui il invite comme super admin.
-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "platoUsername" TEXT;
