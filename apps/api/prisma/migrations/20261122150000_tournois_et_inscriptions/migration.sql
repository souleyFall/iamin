-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('ELIMINATION', 'LEAGUE');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('REGISTRATION', 'CHECK_IN');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'WAITLIST');

-- CreateEnum
CREATE TYPE "Presence" AS ENUM ('UNKNOWN', 'PRESENT', 'ABSENT');

-- CreateTable
CREATE TABLE "Tournament" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "format" "TournamentFormat" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'REGISTRATION',
    "publicSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "platoName" TEXT NOT NULL,
    "platoKey" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL,
    "presence" "Presence" NOT NULL DEFAULT 'UNKNOWN',
    "tokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_publicSlug_key" ON "Tournament"("publicSlug");

-- CreateIndex
CREATE INDEX "Tournament_groupId_idx" ON "Tournament"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_tokenHash_key" ON "Registration"("tokenHash");

-- CreateIndex
CREATE INDEX "Registration_tournamentId_status_idx" ON "Registration"("tournamentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_tournamentId_platoKey_key" ON "Registration"("tournamentId", "platoKey");

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

