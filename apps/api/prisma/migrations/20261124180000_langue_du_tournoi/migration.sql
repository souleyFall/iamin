-- Langue d'un tournoi (page des joueurs et texte du chat), choisie par l'admin.
-- CreateEnum
CREATE TYPE "TournamentLanguage" AS ENUM ('fr', 'en', 'es');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "language" "TournamentLanguage" NOT NULL DEFAULT 'fr';
