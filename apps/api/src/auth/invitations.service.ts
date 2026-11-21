import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { AppConfig } from '../config';
import { APP_CONFIG } from '../config.token';
import { PrismaService } from '../prisma.service';
import { hashPassword, newToken, sha256 } from './crypto';
import { type AuthUser, type CreatedSession, SessionService, toAuthUser } from './session.service';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVALID_INVITATION = 'Invitation invalide ou expirée';

export interface CreatedInvitation {
  id: string;
  role: Role;
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

  /** Invite un futur créateur de groupe. Réservé au propriétaire (vérifié par la route). */
  async create(createdById: string, role: Role, now = new Date()): Promise<CreatedInvitation> {
    const token = newToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const invitation = await this.prisma.invitation.create({
      data: { tokenHash: sha256(token), role, createdById, expiresAt },
    });
    return {
      id: invitation.id,
      role,
      expiresAt,
      token,
      url: `${this.config.webOrigin}/invitation/${token}`,
    };
  }

  /** Invitations en attente (jamais leurs jetons). */
  listPending(createdById: string, now = new Date()) {
    return this.prisma.invitation.findMany({
      where: { createdById, usedAt: null, expiresAt: { gt: now } },
      select: { id: true, role: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Annule une invitation qui n'a pas encore servi. */
  async revoke(createdById: string, id: string): Promise<void> {
    const { count } = await this.prisma.invitation.deleteMany({
      where: { id, createdById, usedAt: null },
    });
    if (count === 0) throw new NotFoundException('Invitation introuvable');
  }

  /**
   * Accepte une invitation : crée le compte et ouvre une session.
   * L'invitation est consommée dans la même transaction que la création du compte, par une
   * mise à jour conditionnelle : deux personnes qui utilisent le lien en même temps ne peuvent
   * pas créer deux comptes, et un nom d'utilisateur déjà pris ne « brûle » pas l'invitation.
   */
  async accept(
    token: string,
    input: { username: string; password: string; platoUsername: string },
    now = new Date(),
  ): Promise<{ user: AuthUser; session: CreatedSession }> {
    const tokenHash = sha256(token);
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.usedAt || invitation.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException(INVALID_INVITATION);
    }

    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.invitation.updateMany({
          where: { id: invitation.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) throw new BadRequestException(INVALID_INVITATION);
        const created = await tx.user.create({
          data: {
            username: input.username,
            platoUsername: input.platoUsername,
            passwordHash,
            role: invitation.role,
          },
        });
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
}
