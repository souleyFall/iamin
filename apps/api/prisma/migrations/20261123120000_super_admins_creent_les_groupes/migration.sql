-- Le propriétaire n'invite plus que des « super admins » (GROUP_CREATOR) : eux seuls créent des groupes.
-- Une invitation de super admin n'est liée à aucun groupe : groupId et groupRole sont alors tous deux NULL.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'GROUP_CREATOR';

-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_groupId_fkey";

-- AlterTable
ALTER TABLE "Invitation" ALTER COLUMN "groupId" DROP NOT NULL,
ALTER COLUMN "groupRole" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les deux colonnes vont ensemble : jamais un groupe sans rôle, ni un rôle sans groupe.
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_group_and_role_together"
  CHECK (("groupId" IS NULL) = ("groupRole" IS NULL));
