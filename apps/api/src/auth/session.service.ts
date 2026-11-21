import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Role, Session, User } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { newToken, sha256 } from './crypto';

/** Durée de vie absolue d'une session : 7 jours (voir le registre RGPD). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** `lastSeenAt` n'est réécrit qu'une fois par minute, pour ne pas écrire à chaque requête. */
const TOUCH_EVERY_MS = 60 * 1000;
const PURGE_EVERY_MS = 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  username: string;
  platoUsername: string;
  role: Role;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
  csrfToken: string;
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    username: user.username,
    platoUsername: user.platoUsername,
    role: user.role,
  };
}

export interface CreatedSession {
  /** Valeur du cookie. N'existe qu'ici : seule son empreinte est en base. */
  token: string;
  csrfToken: string;
  expiresAt: Date;
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
  async create(userId: string, now = new Date()): Promise<CreatedSession> {
    const token = newToken();
    const csrfToken = newToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.prisma.session.create({
      data: { tokenHash: sha256(token), csrfToken, userId, expiresAt, lastSeenAt: now },
    });
    return { token, csrfToken, expiresAt };
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
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      await this.touch(session, now);
    }
    return { user: toAuthUser(session.user), sessionId: session.id, csrfToken: session.csrfToken };
  }

  private async touch(session: Session, now: Date): Promise<void> {
    await this.prisma.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: now } });
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
