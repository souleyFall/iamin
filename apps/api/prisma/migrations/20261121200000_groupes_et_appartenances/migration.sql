-- Les groupes et leurs appartenances remplacent les rôles globaux GROUP_SUPER_ADMIN et ADMIN.
-- Migration cassante, sans conséquence avant la première mise en ligne : aucune instance ne contient
-- encore de compte avec ces rôles. Les invitations en attente n'ont plus de sens sans groupe : on les supprime.
-- (SQL généré par `prisma migrate diff`, puis réordonné : la colonne Invitation.role doit disparaître
-- avant le remplacement de l'énumération Role, sinon PostgreSQL refuse de supprimer l'ancien type.)
DELETE FROM "Invitation";

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('SUPER_ADMIN', 'ADMIN');

-- DropIndex
DROP INDEX "Invitation_usedById_key";

-- AlterTable
ALTER TABLE "Invitation" DROP COLUMN "role",
ADD COLUMN     "groupId" UUID NOT NULL,
ADD COLUMN     "groupRole" "GroupRole" NOT NULL;

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('PLATFORM_OWNER', 'MEMBER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;

-- CreateTable
CREATE TABLE "Group" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "GroupRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "Invitation_groupId_idx" ON "Invitation"("groupId");

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
