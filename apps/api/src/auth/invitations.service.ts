import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type GroupRole, Prisma, Role } from '@prisma/client';
import type { AppConfig } from '../config';
import { APP_CONFIG } from '../config.token';
import { PrismaService } from '../prisma.service';
import { hashPassword, newToken, sha256 } from './crypto';
import { type AuthUser, type CreatedSession, SessionService, toAuthUser } from './session.service';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVALID_INVITATION = 'Invitation invalide ou expirée';

/** Les pseudos Plato se comparent sans tenir compte de la casse. */
const samePseudo = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export interface CreatedInvitation {
  id: string;
  /** `null` pour l'invitation d'un super admin (créateur de groupes), qui n'a pas encore de groupe. */
  groupId: string | null;
  groupRole: GroupRole | null;
  /** Pseudo Plato attendu de la personne invitée, ou `null` si elle le choisit elle-même. */
  platoUsername: string | null;
  expiresAt: Date;
  /** Jeton en clair : montré une seule fois, introuvable ensuite (seule son empreinte est stockée). */
  token: string;
  /** Lien à transmettre à la personne invitée. */
  url: string;
}

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  /**
   * Crée une invitation à rejoindre un groupe avec un rôle. Qui a le droit d'inviter avec quel
   * rôle est décidé par l'appelant (GroupsService) ; ici on ne fait que l'enregistrer.
   * `db` permet de l'inclure dans une transaction (création d'un groupe + invitation).
   */
  async create(
    input: {
      groupId: string | null;
      groupRole: GroupRole | null;
      platoUsername?: string | null;
      createdById: string;
    },
    db: Prisma.TransactionClient = this.prisma,
    now = new Date(),
  ): Promise<CreatedInvitation> {
    const token = newToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const platoUsername = input.platoUsername ?? null;
    const invitation = await db.invitation.create({
      data: { ...input, platoUsername, tokenHash: sha256(token), expiresAt },
    });
    return {
      id: invitation.id,
      groupId: input.groupId,
      groupRole: input.groupRole,
      platoUsername,
      expiresAt,
      token,
      url: `${this.config.webOrigin}/invitation/${token}`,
    };
  }

  /** Le propriétaire invite un super admin : une invitation sans groupe, qui donne le droit d'en créer. */
  createCreator(createdById: string, platoUsername: string): Promise<CreatedInvitation> {
    return this.create({ groupId: null, groupRole: null, platoUsername, createdById });
  }

  /** Invitations de super admins en attente (jamais leurs jetons). */
  listPendingCreators(now = new Date()) {
    return this.prisma.invitation.findMany({
      where: { groupId: null, usedAt: null, expiresAt: { gt: now } },
      select: { id: true, platoUsername: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Annule une invitation de super admin qui n'a pas encore servi. */
  async revokeCreator(id: string): Promise<void> {
    const { count } = await this.prisma.invitation.deleteMany({
      where: { id, groupId: null, usedAt: null },
    });
    if (count === 0) throw new NotFoundException('Invitation introuvable');
  }

  /** Invitations en attente d'un groupe (jamais leurs jetons). */
  listPending(groupId: string, now = new Date()) {
    return this.prisma.invitation.findMany({
      where: { groupId, usedAt: null, expiresAt: { gt: now } },
      select: { id: true, groupRole: true, platoUsername: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Annule une invitation du groupe qui n'a pas encore servi. */
  async revoke(groupId: string, id: string): Promise<void> {
    const { count } = await this.prisma.invitation.deleteMany({
      where: { id, groupId, usedAt: null },
    });
    if (count === 0) throw new NotFoundException('Invitation introuvable');
  }

  /**
   * Consomme une invitation par une mise à jour conditionnelle : deux personnes qui utilisent
   * le lien en même temps ne peuvent pas toutes les deux l'obtenir.
   */
  private async claim(tx: Prisma.TransactionClient, id: string, now: Date): Promise<void> {
    const claimed = await tx.invitation.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new BadRequestException(INVALID_INVITATION);
  }

  private async findUsable(token: string, now: Date) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!invitation || invitation.usedAt || invitation.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException(INVALID_INVITATION);
    }
    return invitation;
  }

  /**
   * Ce que la page du lien a besoin de savoir : le pseudo Plato imposé, s'il y en a un. Un jeton
   * inconnu, expiré ou déjà utilisé reçoit le même refus que pour `accept`.
   */
  async preview(token: string, now = new Date()): Promise<{ platoUsername: string | null }> {
    const invitation = await this.findUsable(token, now);
    return { platoUsername: invitation.platoUsername };
  }

  /**
   * Accepte une invitation avec un nouveau compte : crée le compte, l'ajoute au groupe avec le
   * rôle prévu, et ouvre une session. Tout se passe dans une transaction : un identifiant déjà
   * pris ne « brûle » pas l'invitation.
   */
  async accept(
    token: string,
    input: { username: string; password: string; platoUsername: string },
    now = new Date(),
  ): Promise<{ user: AuthUser; session: CreatedSession }> {
    const invitation = await this.findUsable(token, now);
    // Pseudo imposé par celui qui invite : le formulaire le renvoie tel quel, toute autre valeur est
    // une requête fabriquée.
    if (
      invitation.platoUsername !== null &&
      !samePseudo(invitation.platoUsername, input.platoUsername)
    ) {
      throw new BadRequestException('Le pseudo Plato doit être celui de l’invitation');
    }
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        await this.claim(tx, invitation.id, now);
        const created = await tx.user.create({
          data: {
            username: input.username,
            platoUsername: invitation.platoUsername ?? input.platoUsername,
            passwordHash,
            // Sans groupe : invitation d'un super admin, qui crée ensuite ses propres groupes.
            role: invitation.groupId === null ? Role.GROUP_CREATOR : Role.MEMBER,
          },
        });
        if (invitation.groupId !== null && invitation.groupRole !== null) {
          await tx.groupMember.create({
            data: { groupId: invitation.groupId, userId: created.id, role: invitation.groupRole },
          });
        }
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { usedById: created.id },
        });
        return created;
      });
      const session = await this.sessions.create(user.id, now);
      return { user: toAuthUser(user), session };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Cet identifiant est déjà pris');
      }
      throw error;
    }
  }

  /**
   * Un compte déjà connecté utilise une invitation pour rejoindre un autre groupe.
   * Refusé s'il en fait déjà partie (l'invitation n'est alors pas consommée).
   */
  async join(userId: string, token: string, now = new Date()): Promise<{ groupId: string | null }> {
    const invitation = await this.findUsable(token, now);
    if (invitation.platoUsername !== null) {
      // Invitation nominative : elle n'est utilisable que par le compte portant ce pseudo Plato.
      const me = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { platoUsername: true },
      });
      if (!me || !samePseudo(invitation.platoUsername, me.platoUsername)) {
        throw new ForbiddenException('Cette invitation est destinée à un autre pseudo Plato');
      }
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.claim(tx, invitation.id, now);
        if (invitation.groupId === null || invitation.groupRole === null) {
          // Invitation de super admin : un compte « membre » obtient le droit de créer des groupes.
          // Le propriétaire (ou un super admin déjà validé) n'a rien à gagner : refusé, et l'annulation
          // de la transaction laisse l'invitation intacte.
          const promoted = await tx.user.updateMany({
            where: { id: userId, role: Role.MEMBER },
            data: { role: Role.GROUP_CREATOR },
          });
          if (promoted.count !== 1) throw new ConflictException('Tu peux déjà créer des groupes');
        } else {
          await tx.groupMember.create({
            data: { groupId: invitation.groupId, userId, role: invitation.groupRole },
          });
        }
        await tx.invitation.update({ where: { id: invitation.id }, data: { usedById: userId } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tu fais déjà partie de ce groupe');
      }
      throw error;
    }
    return { groupId: invitation.groupId };
  }
}
