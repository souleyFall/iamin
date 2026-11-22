-- CreateEnum
CREATE TYPE "Side" AS ENUM ('A', 'B');

-- AlterEnum
ALTER TYPE "RegistrationStatus" ADD VALUE 'REPLACED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TournamentStatus" ADD VALUE 'STARTED';
ALTER TYPE "TournamentStatus" ADD VALUE 'FINISHED';

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "drawLegs" INTEGER,
ADD COLUMN     "drawPlayers" TEXT[],
ADD COLUMN     "drawSeed" TEXT,
ADD COLUMN     "drawnAt" TIMESTAMP(3),
ADD COLUMN     "forfeitScore" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "structure" JSONB;

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "scoreA" INTEGER NOT NULL,
    "scoreB" INTEGER NOT NULL,
    "forfeitBy" "Side",
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_tournamentId_code_key" ON "MatchResult"("tournamentId", "code");

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

