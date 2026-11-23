import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { type FeedbackKind, FeedbackStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';

/** Retours non traités au-delà desquels la route publique refuse d'en prendre de nouveaux (R30). */
export const MAX_OPEN_FEEDBACK = 500;
/** Un retour traité est supprimé par la purge au bout de ce délai (registre RGPD, traitement 6). */
export const FEEDBACK_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  /** Pseudo Plato laissé par un joueur sans compte. */
  contact?: string;
  /** Compte admin qui dépose le retour ; absent pour un joueur sans compte. */
  authorId?: string;
}

@Injectable()
export class FeedbackService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Dépose un retour. Un retour anonyme est refusé quand la boîte est pleine : sans cela, un robot
   * pourrait remplir la base à travers la limite de débit, lentement mais sans fin.
   */
  async submit(input: FeedbackInput): Promise<{ id: string }> {
    if (input.authorId === undefined) {
      const open = await this.prisma.feedback.count({
        where: { status: { in: [FeedbackStatus.NEW, FeedbackStatus.READ] } },
      });
      if (open >= MAX_OPEN_FEEDBACK) {
        throw new ServiceUnavailableException(
          'La boîte de retours est pleine pour le moment, réessaie plus tard.',
        );
      }
    }
    const row = await this.prisma.feedback.create({
      data: {
        kind: input.kind,
        message: input.message,
        contact: input.contact ?? null,
        authorId: input.authorId ?? null,
      },
      select: { id: true },
    });
    return row;
  }

  /** Liste pour le propriétaire, les plus récents d'abord. */
  list(status?: FeedbackStatus) {
    return this.prisma.feedback.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        kind: true,
        message: true,
        contact: true,
        status: true,
        createdAt: true,
        handledAt: true,
        author: { select: { username: true } },
      },
    });
  }

  async setStatus(id: string, status: FeedbackStatus, now = new Date()): Promise<void> {
    const { count } = await this.prisma.feedback.updateMany({
      where: { id },
      data: { status, handledAt: status === FeedbackStatus.DONE ? now : null },
    });
    if (count === 0) throw new NotFoundException('Retour introuvable');
  }

  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.feedback.deleteMany({ where: { id } });
    if (count === 0) throw new NotFoundException('Retour introuvable');
  }

  /** Supprime les retours traités depuis plus d'un an. Renvoie le nombre supprimé. */
  async purge(now = new Date()): Promise<{ deleted: number }> {
    const { count } = await this.prisma.feedback.deleteMany({
      where: {
        status: FeedbackStatus.DONE,
        handledAt: { lt: new Date(now.getTime() - FEEDBACK_RETENTION_MS) },
      },
    });
    return { deleted: count };
  }
}
