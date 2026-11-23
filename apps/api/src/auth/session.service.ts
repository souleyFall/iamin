import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Role, type Session, type User } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { newToken, sha256 } from './crypto';

/** Durée de vie absolue d'une session : 7 jours (voir le registre RGPD). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Le propriétaire a une session plus courte : 12 h au total et 30 min sans activité. */
export const OWNER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const OWNER_IDLE_MS = 30 * 60 * 1000;
/** Après une connexion avec code ou une ressaisie, les actions sensibles sont permises 10 minutes. */
export const ELEVATION_MS = 10 * 60 * 1000;
/** `lastSeenAt` n'est réécrit qu'une fois par minute, pour ne pas écrire à chaque requête. */
const TOUCH_EVERY_MS = 60 * 1000;
const PURGE_EVERY_MS = 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  username: string;
  platoUsername: string;
  role: Role;
  /** La double authentification est active sur ce compte. */
  mfaEnabled: boolean;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
  csrfToken: string;
  /** Fin de la période où les actions sensibles sont permises sans redonner le code. */
  elevatedUntil: Date | null;
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    username: user.username,
    platoUsername: user.platoUsername,
    role: user.role,
    mfaEnabled: user.totpEnabledAt !== null,
  };
}

export interface CreatedSession {
  /** Valeur du cookie. N'existe qu'ici : seule son empreinte est en base. */
  token: string;
  csrfToken: string;
  expiresAt: Date;
  /** Fin de la période « élevée » (connexion avec code), sinon 
ull. */
  elevatedUntil: Date | null;
}

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Purge régulière des sessions expirées (R15 : conservation limitée à 7 jours).
    this.timer = setInterval(() => void this.purgeExpired().catch(() => undefined), PURGE_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Ouvre une session avec un jeton neuf à chaque connexion (pas de fixation de session). */
  async create(
    userId: string,
    now = new Date(),
    options: { role?: Role; elevated?: boolean; device?: string } = {},
  ): Promise<CreatedSession> {
    const token = newToken();
    const csrfToken = newToken();
    const ttl = options.role === Role.PLATFORM_OWNER ? OWNER_SESSION_TTL_MS : SESSION_TTL_MS;
    const expiresAt = new Date(now.getTime() + ttl);
    const elevatedUntil = options.elevated ? new Date(now.getTime() + ELEVATION_MS) : null;
    await this.prisma.session.create({
      data: {
        tokenHash: sha256(token),
        csrfToken,
        userId,
        expiresAt,
        lastSeenAt: now,
        elevatedUntil,
        device: options.device ?? null,
      },
    });
    return { token, csrfToken, expiresAt, elevatedUntil };
  }

  /** Retrouve la session d'un jeton de cookie. `null` si inconnue ou expirée. */
  async resolve(token: string, now = new Date()): Promise<AuthContext | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    // Le propriétaire est déconnecté après 30 minutes sans activité.
    if (
      session.user.role === Role.PLATFORM_OWNER &&
      now.getTime() - session.lastSeenAt.getTime() > OWNER_IDLE_MS
    ) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      await this.touch(session, now);
    }
    return {
      user: toAuthUser(session.user),
      sessionId: session.id,
      csrfToken: session.csrfToken,
      elevatedUntil: session.elevatedUntil,
    };
  }

  private async touch(session: Session, now: Date): Promise<void> {
    await this.prisma.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: now } });
  }

  /** Autorise les actions sensibles pendant 10 minutes (après un code valide). */
  async elevate(sessionId: string, now = new Date()): Promise<Date> {
    const elevatedUntil = new Date(now.getTime() + ELEVATION_MS);
    await this.prisma.session.updateMany({ where: { id: sessionId }, data: { elevatedUntil } });
    return elevatedUntil;
  }

  /** Sessions ouvertes d'un compte, la plus récente d'abord ; `current` repère celle qui fait la demande. */
  async listForUser(userId: string, currentSessionId: string, now = new Date()) {
    const rows = await this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, device: true, createdAt: true, lastSeenAt: true },
    });
    return rows.map((r) => ({ ...r, current: r.id === currentSessionId }));
  }

  /** Ferme une autre session du compte (jamais celle en cours : pour elle, la déconnexion). */
  async destroyOther(
    userId: string,
    sessionId: string,
    currentSessionId: string,
  ): Promise<boolean> {
    if (sessionId === currentSessionId) return false;
    const { count } = await this.prisma.session.deleteMany({ where: { id: sessionId, userId } });
    return count === 1;
  }

  async destroy(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  /** Ferme toutes les sessions d'un compte, sauf éventuellement la session en cours. */
  async destroyAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    });
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({ where: { expiresAt: { lte: now } } });
    return count;
  }
}
