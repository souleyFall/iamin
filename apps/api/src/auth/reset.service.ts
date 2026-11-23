import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AppConfig } from '../config';
import { APP_CONFIG } from '../config.token';
import { PrismaService } from '../prisma.service';
import { hashPassword, newToken, sha256 } from './crypto';
import { SecurityService } from './security.service';
import { SessionService } from './session.service';

/** Un jeton de réinitialisation vit une heure : le propriétaire le transmet tout de suite. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const INVALID_RESET = 'Lien de réinitialisation invalide ou expiré';

@Injectable()
export class ResetService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(SecurityService) private readonly security: SecurityService,
  ) {}

  /**
   * Demande publique : « j'ai oublié mon mot de passe ». Elle crée un ticket que le propriétaire
   * voit dans son tableau de bord ; il vérifie l'identité sur Plato avant d'émettre un lien.
   * La réponse est identique que le compte existe ou non (pas d'énumération), et il n'y a
   * jamais plus d'un ticket ouvert par compte (pas de spam du tableau de bord du propriétaire).
   * Le propriétaire lui-même n'a pas de ticket : personne ne pourrait l'approuver.
   */
  async request(rawUsername: string): Promise<void> {
    const username = rawUsername.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || user.role === Role.PLATFORM_OWNER) return;
    const open = await this.prisma.resetTicket.findFirst({
      where: { userId: user.id, status: { in: ['OPEN', 'ISSUED'] } },
      select: { id: true },
    });
    if (open) return;
    await this.prisma.resetTicket.create({ data: { userId: user.id } });
  }

  /** Tickets à traiter, du plus ancien au plus récent. */
  listActive() {
    return this.prisma.resetTicket.findMany({
      where: { status: { in: ['OPEN', 'ISSUED'] } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        issuedAt: true,
        expiresAt: true,
        user: { select: { username: true, platoUsername: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Le propriétaire a vérifié l'identité : il émet un jeton à usage unique et le transmet à la
   * personne (par Plato). Émettre à nouveau remplace le jeton précédent.
   */
  async issue(
    ticketId: string,
    now = new Date(),
  ): Promise<{ token: string; url: string; expiresAt: Date }> {
    const token = newToken();
    const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);
    const { count } = await this.prisma.resetTicket.updateMany({
      where: { id: ticketId, status: { in: ['OPEN', 'ISSUED'] } },
      data: { status: 'ISSUED', tokenHash: sha256(token), issuedAt: now, expiresAt },
    });
    if (count === 0) await this.failNotActive(ticketId);
    // Le titulaire du compte voit dans son journal qu'un lien a été émis pour lui.
    const ticket = await this.prisma.resetTicket.findUnique({
      where: { id: ticketId },
      select: { userId: true },
    });
    if (ticket) await this.security.record(ticket.userId, 'RESET_LINK_ISSUED');
    return { token, url: `${this.config.webOrigin}/reinitialisation/${token}`, expiresAt };
  }

  async close(ticketId: string, now = new Date()): Promise<void> {
    const { count } = await this.prisma.resetTicket.updateMany({
      where: { id: ticketId, status: { in: ['OPEN', 'ISSUED'] } },
      data: { status: 'CLOSED', tokenHash: null, closedAt: now },
    });
    if (count === 0) await this.failNotActive(ticketId);
  }

  private async failNotActive(ticketId: string): Promise<never> {
    const exists = await this.prisma.resetTicket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Ticket introuvable');
    throw new ConflictException('Ce ticket est déjà clos');
  }

  /**
   * Utilise le jeton émis : change le mot de passe et ferme toutes les sessions du compte.
   * Le jeton est consommé par une mise à jour conditionnelle dans la même transaction que le
   * changement de mot de passe : il ne sert qu'une fois, même si deux requêtes arrivent ensemble.
   */
  async reset(token: string, newPassword: string, now = new Date()): Promise<void> {
    const ticket = await this.prisma.resetTicket.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (
      !ticket ||
      ticket.status !== 'ISSUED' ||
      !ticket.expiresAt ||
      ticket.expiresAt.getTime() <= now.getTime()
    ) {
      throw new BadRequestException(INVALID_RESET);
    }
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.resetTicket.updateMany({
        where: { id: ticket.id, status: 'ISSUED', expiresAt: { gt: now } },
        data: { status: 'USED', tokenHash: null, closedAt: now },
      });
      if (claimed.count !== 1) throw new BadRequestException(INVALID_RESET);
      await tx.user.update({
        where: { id: ticket.userId },
        data: { passwordHash, passwordChangedAt: now },
      });
    });
    await this.sessions.destroyAllForUser(ticket.userId);
    await this.security.record(ticket.userId, 'PASSWORD_RESET');
  }
}
