import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { GroupRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { EventsService } from './events.service';
import { assertHolder, TournamentsService } from './tournaments.service';

type Tx = Prisma.TransactionClient;
type Locked = Awaited<ReturnType<TournamentsService['lockTournament']>>;

/**
 * Le relais entre admins (D5) : un seul admin « tient la main » par tournoi et lui seul écrit.
 *
 * - Un tournoi sans détenteur peut être pris par n'importe quel admin du groupe.
 * - Le détenteur peut la libérer, ou la proposer à un autre admin du groupe, qui doit l'accepter.
 * - Le super admin du groupe peut la reprendre à tout moment (le détenteur a disparu, ou bloque).
 * - Chaque changement est verrouillé (ligne du tournoi) et inscrit au journal, dans la même
 *   transaction. Le propriétaire de la plateforme n'a pas accès : `allowOwner` reste faux.
 */
@Injectable()
export class RelayService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TournamentsService) private readonly tournaments: TournamentsService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  private async run(
    groupId: string,
    tournamentId: string,
    change: (tx: Tx, t: Locked) => Promise<void>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const t = await this.tournaments.lockTournament(tx, groupId, tournamentId);
      await change(tx, t);
    });
    return this.tournaments.get(groupId, tournamentId);
  }

  /** Prend la main si elle est libre ; un super admin la reprend même si quelqu'un la tient. */
  take(groupId: string, actorId: string, role: GroupRole | null, tournamentId: string) {
    return this.run(groupId, tournamentId, async (tx, t) => {
      if (t.holderId === actorId) throw new ConflictException('Vous tenez déjà la main');
      const reclaim = t.holderId !== null;
      if (reclaim && role !== 'SUPER_ADMIN') {
        throw new ForbiddenException('Un autre admin tient la main : demandez-lui le relais');
      }
      await tx.tournament.update({
        where: { id: tournamentId },
        data: { holderId: actorId, handoverToId: null },
      });
      await this.events.record(
        tx,
        tournamentId,
        actorId,
        reclaim ? 'RELAY_RECLAIMED' : 'RELAY_TAKEN',
        reclaim ? { fromUserId: t.holderId } : {},
      );
    });
  }

  /** Le détenteur rend la main : n'importe quel admin du groupe peut alors la prendre. */
  release(groupId: string, actorId: string, tournamentId: string) {
    return this.run(groupId, tournamentId, async (tx, t) => {
      assertHolder(t, actorId);
      await tx.tournament.update({
        where: { id: tournamentId },
        data: { holderId: null, handoverToId: null },
      });
      await this.events.record(tx, tournamentId, actorId, 'RELAY_RELEASED');
    });
  }

  /** Le détenteur propose le relais à un autre admin DU GROUPE ; rien ne change avant son accord. */
  offer(groupId: string, actorId: string, tournamentId: string, toUserId: string) {
    return this.run(groupId, tournamentId, async (tx, t) => {
      assertHolder(t, actorId);
      if (toUserId === actorId) throw new BadRequestException('Choisissez un autre admin');
      const target = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: toUserId } },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('Admin introuvable dans ce groupe');
      await tx.tournament.update({ where: { id: tournamentId }, data: { handoverToId: toUserId } });
      await this.events.record(tx, tournamentId, actorId, 'RELAY_OFFERED', { toUserId });
    });
  }

  cancelOffer(groupId: string, actorId: string, tournamentId: string) {
    return this.run(groupId, tournamentId, async (tx, t) => {
      assertHolder(t, actorId);
      if (t.handoverToId === null) throw new NotFoundException('Aucune proposition en cours');
      await tx.tournament.update({ where: { id: tournamentId }, data: { handoverToId: null } });
      await this.events.record(tx, tournamentId, actorId, 'RELAY_CANCELED', {
        toUserId: t.handoverToId,
      });
    });
  }

  /** Le destinataire accepte : il devient détenteur. Seul lui le peut. */
  accept(groupId: string, actorId: string, tournamentId: string) {
    return this.run(groupId, tournamentId, async (tx, t) => {
      this.assertAddressee(t, actorId);
      await tx.tournament.update({
        where: { id: tournamentId },
        data: { holderId: actorId, handoverToId: null },
      });
      await this.events.record(tx, tournamentId, actorId, 'RELAY_ACCEPTED', {
        fromUserId: t.holderId,
      });
    });
  }

  decline(groupId: string, actorId: string, tournamentId: string) {
    return this.run(groupId, tournamentId, async (tx, t) => {
      this.assertAddressee(t, actorId);
      await tx.tournament.update({ where: { id: tournamentId }, data: { handoverToId: null } });
      await this.events.record(tx, tournamentId, actorId, 'RELAY_DECLINED', {
        fromUserId: t.holderId,
      });
    });
  }

  private assertAddressee(t: Locked, actorId: string): void {
    if (t.handoverToId !== actorId) {
      throw new ForbiddenException('Aucune proposition de relais pour vous');
    }
  }
}
