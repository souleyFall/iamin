import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GroupRole, Role } from '@prisma/client';
import { InvitationsService, type CreatedInvitation } from '../auth/invitations.service';

import type { AuthContext } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import type { GroupContext } from './group.guard';

/** Plafond de groupes qu'un super admin peut créer (limite l'abus d'un compte validé). */
export const MAX_GROUPS_PER_CREATOR = 5;

export interface GroupSummary {
  id: string;
  name: string;
  createdAt: Date;
  /** Rôle du compte dans ce groupe ; `null` pour le propriétaire de la plateforme (non membre). */
  myRole: GroupRole | null;
  memberCount: number;
}

@Injectable()
export class GroupsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InvitationsService) private readonly invitations: InvitationsService,
  ) {}

  /**
   * Un super admin (GROUP_CREATOR) crée un groupe et en devient super admin, dans la même
   * transaction : jamais de groupe sans personne pour le gérer. Le nombre de groupes par compte est
   * plafonné ; la ligne du compte est verrouillée pour que deux créations simultanées ne dépassent
   * pas le plafond.
   */
  async create(creatorId: string, name: string): Promise<{ group: { id: string; name: string } }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${creatorId}::uuid FOR UPDATE`;
      const owned = await tx.groupMember.count({
        where: { userId: creatorId, role: GroupRole.SUPER_ADMIN },
      });
      if (owned >= MAX_GROUPS_PER_CREATOR) {
        throw new ConflictException(
          `Tu as atteint la limite de ${MAX_GROUPS_PER_CREATOR} groupes par super admin`,
        );
      }
      const group = await tx.group.create({ data: { name } });
      await tx.groupMember.create({
        data: { groupId: group.id, userId: creatorId, role: GroupRole.SUPER_ADMIN },
      });
      return { group: { id: group.id, name: group.name } };
    });
  }

  /**
   * Groupes visibles par le compte : les siens ; le propriétaire de la plateforme les voit tous
   * (assistance), sans en être membre.
   */
  async listFor(auth: AuthContext): Promise<GroupSummary[]> {
    if (auth.user.role === Role.PLATFORM_OWNER) {
      const groups = await this.prisma.group.findMany({
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return groups.map((g) => ({
        id: g.id,
        name: g.name,
        createdAt: g.createdAt,
        myRole: null,
        memberCount: g._count.members,
      }));
    }
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId: auth.user.id },
      include: { group: { include: { _count: { select: { members: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      createdAt: m.group.createdAt,
      myRole: m.role,
      memberCount: m.group._count.members,
    }));
  }

  /** Détail d'un groupe : l'accès a déjà été vérifié par `GroupGuard`. */
  async get(groupId: string, access: GroupContext) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { user: { select: { id: true, username: true, platoUsername: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!group) throw new NotFoundException('Groupe introuvable');
    return {
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      myRole: access.role,
      members: group.members.map((m) => ({
        userId: m.user.id,
        username: m.user.username,
        platoUsername: m.user.platoUsername,
        role: m.role,
      })),
    };
  }

  /**
   * Invite quelqu'un dans le groupe. Un super admin invite des admins ; seul le propriétaire de la
   * plateforme invite un super admin (par exemple si le créateur a perdu son compte). Personne ne
   * peut donc se donner, ni donner à un tiers, un rôle supérieur à celui qu'il a.
   */
  invite(
    auth: AuthContext,
    access: GroupContext,
    groupRole: GroupRole,
  ): Promise<CreatedInvitation> {
    if (groupRole === GroupRole.SUPER_ADMIN && access.role !== null) {
      throw new ForbiddenException('Seul le propriétaire de la plateforme invite un super admin');
    }
    return this.invitations.create({
      groupId: access.groupId,
      groupRole,
      createdById: auth.user.id,
    });
  }

  /** Retire un admin du groupe. Un super admin ne se retire pas ici : le groupe resterait sans chef. */
  async removeMember(groupId: string, userId: string): Promise<void> {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true, role: true },
    });
    if (!membership) throw new NotFoundException('Membre introuvable');
    if (membership.role === GroupRole.SUPER_ADMIN) {
      throw new ConflictException('Un super admin ne peut pas être retiré du groupe');
    }
    await this.prisma.$transaction([
      this.prisma.groupMember.delete({ where: { id: membership.id } }),
      // Un admin retiré ne garde pas la main (ni une proposition de relais) sur les tournois du groupe.
      this.prisma.tournament.updateMany({
        where: { groupId, holderId: userId },
        data: { holderId: null },
      }),
      this.prisma.tournament.updateMany({
        where: { groupId, handoverToId: userId },
        data: { handoverToId: null },
      }),
    ]);
  }
}
