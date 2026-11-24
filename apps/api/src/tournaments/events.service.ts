import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export type EventType =
  | 'TOURNAMENT_CREATED'
  | 'TOURNAMENT_UPDATED'
  | 'PLAYER_REGISTERED'
  | 'PLAYER_WITHDREW'
  | 'PLAYER_ADDED'
  | 'PLAYER_ACCEPTED'
  | 'PLAYER_PROMOTED'
  | 'PLAYER_REMOVED'
  | 'PRESENCE_SET'
  | 'DRAW_DONE'
  | 'RESULT_SET'
  | 'RESULT_DELETED'
  | 'PLAYER_REPLACED'
  | 'RELAY_TAKEN'
  | 'RELAY_RECLAIMED'
  | 'RELAY_RELEASED'
  | 'RELAY_OFFERED'
  | 'RELAY_ACCEPTED'
  | 'RELAY_DECLINED'
  | 'RELAY_CANCELED';

export const MAX_EVENTS_PER_PAGE = 100;

/**
 * Journal d'événements d'un tournoi (R14) : qui a fait quoi, quand.
 *
 * `record` est appelé DANS la transaction du changement : pas de changement sans trace, pas de
 * trace d'un changement annulé. La charge ne contient que des identifiants, des codes de match et
 * des scores, jamais un pseudo : effacer un joueur ne laisse rien de lui ici.
 */
@Injectable()
export class EventsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  record(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    actorId: string | null,
    type: EventType,
    payload: Prisma.InputJsonObject = {},
  ) {
    return tx.tournamentEvent.create({ data: { tournamentId, actorId, type, payload } });
  }

  /** Les plus récents d'abord. `before` : identifiant du dernier événement de la page précédente. */
  async list(groupId: string, tournamentId: string, limit: number, before?: string) {
    // `groupId` dans la requête : un tournoi d'un autre groupe est introuvable (R1).
    const tournament = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, groupId },
      select: { id: true },
    });
    if (!tournament) throw new NotFoundException('Tournoi introuvable');
    if (before !== undefined) {
      const known = await this.prisma.tournamentEvent.findFirst({
        where: { id: before, tournamentId },
        select: { id: true },
      });
      if (!known) throw new BadRequestException('Curseur inconnu');
    }
    const rows = await this.prisma.tournamentEvent.findMany({
      where: { tournamentId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(limit, MAX_EVENTS_PER_PAGE) + 1,
      ...(before === undefined ? {} : { cursor: { id: before }, skip: 1 }),
      select: {
        id: true,
        type: true,
        payload: true,
        createdAt: true,
        actor: { select: { id: true, username: true } },
      },
    });
    const page = rows.slice(0, Math.min(limit, MAX_EVENTS_PER_PAGE));
    return {
      events: page,
      nextBefore: rows.length > page.length ? (page[page.length - 1]?.id ?? null) : null,
      refs: await this.namesIn(
        tournamentId,
        page.map((e) => e.payload),
      ),
    };
  }

  /**
   * Les noms que le journal affiche. La charge d'un événement ne garde que des identifiants (un
   * pseudo effacé ne doit pas rester dans l'historique) : on les remplace ici, à la lecture. Un
   * joueur ou un compte supprimé depuis n'a plus de nom, et l'écran écrit « joueur retiré ».
   */
  private async namesIn(tournamentId: string, payloads: unknown[]) {
    const players = new Set<string>();
    const users = new Set<string>();
    const text = (v: unknown) => (typeof v === 'string' ? v : null);
    for (const payload of payloads) {
      if (typeof payload !== 'object' || payload === null) continue;
      const p = payload as Record<string, unknown>;
      for (const key of ['registrationId', 'outId', 'inId']) {
        const id = text(p[key]);
        if (id) players.add(id);
      }
      if (Array.isArray(p.registrationIds)) {
        for (const v of p.registrationIds) {
          const id = text(v);
          if (id) players.add(id);
        }
      }
      for (const key of ['fromUserId', 'toUserId']) {
        const id = text(p[key]);
        if (id) users.add(id);
      }
    }
    const [registrations, accounts] = await Promise.all([
      players.size === 0
        ? []
        : this.prisma.registration.findMany({
            where: { tournamentId, id: { in: [...players] } },
            select: { id: true, platoName: true },
          }),
      users.size === 0
        ? []
        : this.prisma.user.findMany({
            where: { id: { in: [...users] } },
            select: { id: true, username: true },
          }),
    ]);
    return {
      players: Object.fromEntries(registrations.map((r) => [r.id, r.platoName])),
      users: Object.fromEntries(accounts.map((u) => [u.id, u.username])),
    };
  }
}
