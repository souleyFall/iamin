import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Prisma,
  Presence,
  RegistrationStatus,
  type TournamentFormat,
  TournamentStatus,
} from '@prisma/client';
import { newToken, sha256 } from '../auth/crypto';
import { PrismaService } from '../prisma.service';
import { EventsService } from './events.service';

/** Inscriptions en attente de validation, par tournoi : borne le gain d'un robot sur le lien public (R8). */
export const MAX_PENDING = 200;

const TOURNAMENT_NOT_FOUND = 'Tournoi introuvable';
const REGISTRATION_NOT_FOUND = 'Inscription introuvable';

type Tx = Prisma.TransactionClient;

export interface RegistrationView {
  id: string;
  platoName: string;
  status: RegistrationStatus;
  presence: Presence;
  createdAt: Date;
}

const registrationSelect = {
  id: true,
  platoName: true,
  status: true,
  presence: true,
  createdAt: true,
} as const;

/** Un pseudo ne s'inscrit qu'une fois par tournoi, sans tenir compte de la casse. */
export const platoKey = (name: string): string => name.normalize('NFKC').toLowerCase();

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';

/**
 * Tournois et inscriptions.
 *
 * Chaque méthode d'administration reçoit le `groupId` vérifié par `GroupGuard` et l'inclut dans
 * TOUTES ses requêtes : un identifiant de tournoi ou d'inscription d'un autre groupe est introuvable
 * (R1). Les écritures qui touchent aux places verrouillent la ligne du tournoi pour que deux
 * validations simultanées ne dépassent jamais la capacité.
 */
@Injectable()
export class TournamentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  // ---------------------------------------------------------------------------------------------
  // Administration (groupe vérifié par GroupGuard)
  // ---------------------------------------------------------------------------------------------

  /** Le créateur tient la main sur son tournoi (D5). */
  create(
    groupId: string,
    actorId: string,
    input: { name: string; format: TournamentFormat; capacity: number; forfeitScore?: number },
  ) {
    assertLeagueSize(input.format, input.capacity);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.tournament.create({
        data: {
          ...input,
          groupId,
          holderId: actorId,
          publicSlug: randomBytes(16).toString('base64url'),
        },
        select: tournamentSelect,
      });
      await this.events.record(tx, created.id, actorId, 'TOURNAMENT_CREATED', {
        format: input.format,
        capacity: input.capacity,
      });
      return created;
    });
  }

  async list(groupId: string) {
    const rows = await this.prisma.tournament.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      select: { ...tournamentSelect, registrations: { select: { status: true } } },
    });
    return rows.map(({ registrations, ...t }) => ({
      ...t,
      counts: countByStatus(registrations.map((r) => r.status)),
    }));
  }

  async get(groupId: string, tournamentId: string) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, groupId },
      select: {
        ...tournamentSelect,
        registrations: {
          select: registrationSelect,
          orderBy: [{ validatedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        },
      },
    });
    if (!tournament) throw new NotFoundException(TOURNAMENT_NOT_FOUND);
    return tournament;
  }

  async update(
    groupId: string,
    actorId: string,
    tournamentId: string,
    input: {
      name?: string;
      capacity?: number;
      forfeitScore?: number;
      status?: typeof TournamentStatus.REGISTRATION | typeof TournamentStatus.CHECK_IN;
    },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const tournament = await this.lockTournament(tx, groupId, tournamentId);
      assertHolder(tournament, actorId);
      const drawn = !isOpen(tournament.status);
      if (drawn && (input.status !== undefined || input.capacity !== undefined)) {
        throw new ConflictException('Le tirage est fait : les places et la phase sont figées');
      }
      if (input.capacity !== undefined) {
        const { format } = await tx.tournament.findUniqueOrThrow({
          where: { id: tournamentId },
          select: { format: true },
        });
        assertLeagueSize(format, input.capacity);
        const accepted = await tx.registration.count({
          where: { tournamentId, status: RegistrationStatus.ACCEPTED },
        });
        if (input.capacity < accepted) {
          throw new ConflictException(
            `Impossible : ${accepted} joueurs sont déjà acceptés. Retirez-en avant de réduire les places.`,
          );
        }
      }
      await tx.tournament.update({ where: { id: tournamentId }, data: input });
      await this.events.record(tx, tournamentId, actorId, 'TOURNAMENT_UPDATED', { ...input });
      await this.promoteFromWaitlist(tx, tournamentId, actorId);
    });
    return this.get(groupId, tournamentId);
  }

  /** Un admin inscrit directement un joueur : déjà validé, donc accepté ou en liste d'attente. */
  async addPlayer(groupId: string, actorId: string, tournamentId: string, platoName: string) {
    return this.prisma
      .$transaction(async (tx) => {
        const tournament = await this.lockTournament(tx, groupId, tournamentId);
        assertHolder(tournament, actorId);
        assertOpen(tournament.status);
        const status = await this.statusForValidated(tx, tournament);
        const created = await tx.registration.create({
          data: {
            tournamentId,
            platoName,
            platoKey: platoKey(platoName),
            status,
            validatedAt: new Date(),
          },
          select: registrationSelect,
        });
        await this.events.record(tx, tournamentId, actorId, 'PLAYER_ADDED', {
          registrationId: created.id,
          status,
        });
        return created;
      })
      .catch(rethrowDuplicate);
  }

  /** Valide une inscription en attente : acceptée s'il reste de la place, sinon en liste d'attente. */
  async accept(groupId: string, actorId: string, tournamentId: string, registrationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const tournament = await this.lockTournament(tx, groupId, tournamentId);
      assertHolder(tournament, actorId);
      assertOpen(tournament.status);
      const registration = await tx.registration.findFirst({
        where: { id: registrationId, tournamentId },
        select: { status: true },
      });
      if (!registration) throw new NotFoundException(REGISTRATION_NOT_FOUND);
      if (registration.status !== RegistrationStatus.PENDING) {
        throw new ConflictException('Cette inscription est déjà validée');
      }
      const status = await this.statusForValidated(tx, tournament);
      const updated = await tx.registration.update({
        where: { id: registrationId },
        data: { status, validatedAt: new Date() },
        select: registrationSelect,
      });
      await this.events.record(tx, tournamentId, actorId, 'PLAYER_ACCEPTED', {
        registrationId,
        status,
      });
      return updated;
    });
  }

  /** Pointage : seulement pour un joueur accepté, et seulement pendant la phase de pointage. */
  async setPresence(
    groupId: string,
    actorId: string,
    tournamentId: string,
    registrationId: string,
    presence: Presence,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const tournament = await this.lockTournament(tx, groupId, tournamentId);
      assertHolder(tournament, actorId);
      if (tournament.status !== TournamentStatus.CHECK_IN) {
        throw new ConflictException('Le pointage n’est pas ouvert');
      }
      const registration = await tx.registration.findFirst({
        where: { id: registrationId, tournamentId },
        select: { status: true },
      });
      if (!registration) throw new NotFoundException(REGISTRATION_NOT_FOUND);
      if (registration.status !== RegistrationStatus.ACCEPTED) {
        throw new ConflictException('Seuls les joueurs acceptés se pointent');
      }
      const updated = await tx.registration.update({
        where: { id: registrationId },
        data: { presence },
        select: registrationSelect,
      });
      await this.events.record(tx, tournamentId, actorId, 'PRESENCE_SET', {
        registrationId,
        presence,
      });
      return updated;
    });
  }

  /** Retire un joueur (la ligne est supprimée) ; le premier de la liste d'attente prend sa place. */
  async removePlayer(
    groupId: string,
    actorId: string,
    tournamentId: string,
    registrationId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const tournament = await this.lockTournament(tx, groupId, tournamentId);
      assertHolder(tournament, actorId);
      assertOpen(tournament.status, 'Utilisez le remplacement pour changer un joueur');
      const { count } = await tx.registration.deleteMany({
        where: { id: registrationId, tournamentId },
      });
      if (count === 0) throw new NotFoundException(REGISTRATION_NOT_FOUND);
      await this.events.record(tx, tournamentId, actorId, 'PLAYER_REMOVED', { registrationId });
      await this.promoteFromWaitlist(tx, tournamentId, actorId);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Joueurs (sans compte)
  // ---------------------------------------------------------------------------------------------

  async publicInfo(slug: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { publicSlug: slug },
      select: { name: true, format: true, status: true },
    });
    if (!tournament) throw new NotFoundException(TOURNAMENT_NOT_FOUND);
    return { ...tournament, registrationOpen: tournament.status === TournamentStatus.REGISTRATION };
  }

  /** Inscription via le lien public : en attente de validation. Le lien personnel n'est montré qu'ici. */
  async register(slug: string, platoName: string) {
    const token = newToken();
    const registration = await this.prisma
      .$transaction(async (tx) => {
        const found = await tx.tournament.findUnique({
          where: { publicSlug: slug },
          select: { id: true },
        });
        if (!found) throw new NotFoundException(TOURNAMENT_NOT_FOUND);
        const tournament = await this.lockTournamentById(tx, found.id);
        if (tournament.status !== TournamentStatus.REGISTRATION) {
          throw new ConflictException('Les inscriptions sont closes');
        }
        const pending = await tx.registration.count({
          where: { tournamentId: tournament.id, status: RegistrationStatus.PENDING },
        });
        if (pending >= MAX_PENDING) {
          throw new ConflictException('Trop d’inscriptions en attente, réessayez plus tard');
        }
        const created = await tx.registration.create({
          data: {
            tournamentId: tournament.id,
            platoName,
            platoKey: platoKey(platoName),
            status: RegistrationStatus.PENDING,
            tokenHash: sha256(token),
          },
          select: registrationSelect,
        });
        await this.events.record(tx, tournament.id, null, 'PLAYER_REGISTERED', {
          registrationId: created.id,
        });
        return created;
      })
      .catch(rethrowDuplicate);
    return { registration, token };
  }

  /** Suivi par le joueur : son propre statut, jamais les autres inscrits. */
  async myRegistration(token: string) {
    const row = await this.prisma.registration.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        ...registrationSelect,
        validatedAt: true,
        tournamentId: true,
        tournament: { select: { name: true, status: true } },
      },
    });
    if (!row) throw new NotFoundException(REGISTRATION_NOT_FOUND);
    let waitlistPosition: number | null = null;
    if (row.status === RegistrationStatus.WAITLIST && row.validatedAt) {
      const ahead = await this.prisma.registration.count({
        where: {
          tournamentId: row.tournamentId,
          status: RegistrationStatus.WAITLIST,
          OR: [
            { validatedAt: { lt: row.validatedAt } },
            { validatedAt: row.validatedAt, createdAt: { lt: row.createdAt } },
          ],
        },
      });
      waitlistPosition = ahead + 1;
    }
    return {
      id: row.id,
      platoName: row.platoName,
      status: row.status,
      presence: row.presence,
      waitlistPosition,
      tournament: row.tournament,
    };
  }

  /** Le joueur annule : sa ligne est supprimée et sa place profite à la liste d'attente. */
  async withdraw(token: string) {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.registration.findUnique({
        where: { tokenHash: sha256(token) },
        select: { id: true, tournamentId: true },
      });
      if (!row) throw new NotFoundException(REGISTRATION_NOT_FOUND);
      const tournament = await this.lockTournamentById(tx, row.tournamentId);
      assertOpen(tournament.status, 'Le tirage est fait : prévenez un admin pour vous retirer');
      await tx.registration.deleteMany({ where: { id: row.id } });
      await this.events.record(tx, row.tournamentId, null, 'PLAYER_WITHDREW', {
        registrationId: row.id,
      });
      await this.promoteFromWaitlist(tx, row.tournamentId, null);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Outils internes
  // ---------------------------------------------------------------------------------------------

  /** Verrouille le tournoi DU GROUPE (404 sinon) : sérialise les écritures qui touchent aux places. */
  async lockTournament(tx: Tx, groupId: string, tournamentId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Tournament" WHERE id = ${tournamentId}::uuid AND "groupId" = ${groupId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException(TOURNAMENT_NOT_FOUND);
    return this.lockedTournament(tx, tournamentId);
  }

  private async lockTournamentById(tx: Tx, tournamentId: string) {
    await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId}::uuid FOR UPDATE`;
    return this.lockedTournament(tx, tournamentId);
  }

  private async lockedTournament(tx: Tx, tournamentId: string) {
    return tx.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
      select: { id: true, capacity: true, status: true, holderId: true, handoverToId: true },
    });
  }

  private async statusForValidated(tx: Tx, tournament: { id: string; capacity: number }) {
    const accepted = await tx.registration.count({
      where: { tournamentId: tournament.id, status: RegistrationStatus.ACCEPTED },
    });
    return accepted < tournament.capacity
      ? RegistrationStatus.ACCEPTED
      : RegistrationStatus.WAITLIST;
  }

  /** Fait passer en ACCEPTED les premiers de la liste d'attente tant qu'il reste de la place. */
  private async promoteFromWaitlist(tx: Tx, tournamentId: string, actorId: string | null) {
    const tournament = await tx.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
      select: { capacity: true },
    });
    const accepted = await tx.registration.count({
      where: { tournamentId, status: RegistrationStatus.ACCEPTED },
    });
    const room = tournament.capacity - accepted;
    if (room <= 0) return;
    const next = await tx.registration.findMany({
      where: { tournamentId, status: RegistrationStatus.WAITLIST },
      orderBy: [{ validatedAt: 'asc' }, { createdAt: 'asc' }],
      take: room,
      select: { id: true },
    });
    if (next.length === 0) return;
    await tx.registration.updateMany({
      where: { id: { in: next.map((r) => r.id) } },
      data: { status: RegistrationStatus.ACCEPTED },
    });
    await this.events.record(tx, tournamentId, actorId, 'PLAYER_PROMOTED', {
      registrationIds: next.map((r) => r.id),
    });
  }
}

const tournamentSelect = {
  id: true,
  name: true,
  format: true,
  capacity: true,
  status: true,
  publicSlug: true,
  forfeitScore: true,
  createdAt: true,
  drawnAt: true,
  drawSeed: true,
  holder: { select: { id: true, username: true } },
  handoverTo: { select: { id: true, username: true } },
} as const;

/** Écrire sur un tournoi demande d'en tenir la main (D5) ; les autres admins du groupe lisent. */
export function assertHolder(tournament: { holderId: string | null }, actorId: string): void {
  if (tournament.holderId === actorId) return;
  throw new ForbiddenException(
    tournament.holderId === null
      ? 'Personne ne tient la main : prenez-la pour modifier ce tournoi'
      : 'Un autre admin tient la main sur ce tournoi',
  );
}

/** Une ligue de N joueurs a N×(N-1)/2 matchs : on borne pour garder un calendrier lisible. */
export const MAX_LEAGUE_PLAYERS = 32;

function assertLeagueSize(format: TournamentFormat, capacity: number): void {
  if (format === 'LEAGUE' && capacity > MAX_LEAGUE_PLAYERS) {
    throw new BadRequestException(`Une ligue accepte ${MAX_LEAGUE_PLAYERS} joueurs au plus`);
  }
}

/** Avant le tirage : inscriptions et pointage sont modifiables. Après : tout est figé. */
export const isOpen = (status: TournamentStatus): boolean =>
  status === TournamentStatus.REGISTRATION || status === TournamentStatus.CHECK_IN;

function assertOpen(
  status: TournamentStatus,
  message = 'Le tirage est fait : la liste des joueurs est figée',
): void {
  if (!isOpen(status)) throw new ConflictException(message);
}

function countByStatus(statuses: RegistrationStatus[]) {
  return {
    pending: statuses.filter((s) => s === RegistrationStatus.PENDING).length,
    accepted: statuses.filter((s) => s === RegistrationStatus.ACCEPTED).length,
    waitlist: statuses.filter((s) => s === RegistrationStatus.WAITLIST).length,
  };
}

function rethrowDuplicate(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ConflictException('Ce pseudo est déjà inscrit à ce tournoi');
  }
  throw error;
}
