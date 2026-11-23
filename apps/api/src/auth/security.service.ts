import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { SecurityEventType } from '@prisma/client';
import { PrismaService } from '../prisma.service';

/** Le journal de sécurité d'un compte est gardé 30 jours (registre RGPD, traitement 1). */
export const SECURITY_EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PURGE_EVERY_MS = 60 * 60 * 1000;
/** Les échecs répétés (mot de passe, code) ne s'écrivent qu'une fois par période : un robot ne remplit pas la base. */
const FAILURE_DEDUPE_MS = 10 * 60 * 1000;
const RECENT_LIMIT = 40;

/**
 * Journal de sécurité d'un compte : connexions, échecs, changements de mot de passe, liens de
 * réinitialisation émis, codes de secours utilisés… Le titulaire le lit dans l'écran Sécurité ; si
 * quelqu'un entre malgré tout, c'est ici qu'il le voit. Ni adresse IP, ni agent utilisateur brut.
 */
@Injectable()
export class SecurityService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.purge().catch(() => undefined), PURGE_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Écrire dans le journal ne doit jamais empêcher l'action qu'il décrit : une erreur est avalée. */
  async record(userId: string, type: SecurityEventType, device?: string | null): Promise<void> {
    try {
      await this.prisma.securityEvent.create({ data: { userId, type, device: device ?? null } });
    } catch {
      // Journal indisponible : la connexion, elle, doit continuer.
    }
  }

  /** Comme `record`, mais seulement si le même événement n'a pas déjà été écrit récemment. */
  async recordOnce(
    userId: string,
    type: SecurityEventType,
    device?: string | null,
    now = new Date(),
  ): Promise<void> {
    try {
      const recent = await this.prisma.securityEvent.findFirst({
        where: { userId, type, createdAt: { gt: new Date(now.getTime() - FAILURE_DEDUPE_MS) } },
        select: { id: true },
      });
      if (!recent) await this.record(userId, type, device);
    } catch {
      // idem
    }
  }

  /** Les événements récents d'un compte, du plus récent au plus ancien. */
  recent(userId: string) {
    return this.prisma.securityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
      select: { id: true, type: true, device: true, createdAt: true },
    });
  }

  async purge(now = new Date()): Promise<number> {
    const { count } = await this.prisma.securityEvent.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - SECURITY_EVENT_TTL_MS) } },
    });
    return count;
  }
}
