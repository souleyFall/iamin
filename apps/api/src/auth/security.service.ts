import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { SecurityEventType } from '@prisma/client';
import { describeError, logger } from '../logging/app-logger';
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
    this.timer = setInterval(() => {
      this.purge()
        .then((count) => {
          if (count > 0) logger.event('security.purge', { count }, 'info', 'Security');
        })
        .catch((error: unknown) =>
          logger.write('error', 'Security', 'Purge du journal de sécurité en échec', {
            event: 'security.purge_failed',
            ...describeError(error),
          }),
        );
    }, PURGE_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Écrire dans le journal ne doit jamais empêcher l'action qu'il décrit : une erreur est avalée. */
  async record(userId: string, type: SecurityEventType, device?: string | null): Promise<void> {
    // Le même événement part aussi au journal technique (sans appareil), pour retrouver une
    // attaque ou un incident d'un coup d'œil : `--event security.account_locked`.
    logger.event(
      `security.${type.toLowerCase()}`,
      { subject: userId },
      type === 'ACCOUNT_LOCKED' || type.endsWith('_FAILED') ? 'warn' : 'info',
      'Security',
    );
    try {
      await this.prisma.securityEvent.create({ data: { userId, type, device: device ?? null } });
    } catch (error) {
      // Journal indisponible : la connexion, elle, doit continuer, mais on le sait.
      logger.write('error', 'Security', 'Écriture du journal de sécurité impossible', {
        event: 'security.journal_unavailable',
        ...describeError(error),
      });
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
    } catch (error) {
      logger.write('error', 'Security', 'Lecture du journal de sécurité impossible', {
        event: 'security.journal_unavailable',
        ...describeError(error),
      });
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
