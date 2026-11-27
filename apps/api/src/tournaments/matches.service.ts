import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Prisma,
  Presence,
  RegistrationStatus,
  Side,
  TournamentFormat,
  TournamentStatus,
} from '@prisma/client';
import {
  assertScore,
  type Bracket,
  buildBracket,
  buildLeague,
  computeStandings,
  EngineError,
  type League,
  resolveBracket,
  type Score,
} from '@iamin/engine';
import { PrismaService } from '../prisma.service';
import { EventsService } from './events.service';
import { assertHolder, TournamentsService } from './tournaments.service';

type Tx = Prisma.TransactionClient;

const NOT_DRAWN = 'Le tirage n’est pas fait';
const MATCH_NOT_FOUND = 'Match introuvable';

/**
 * Ligue : un score `{ a, b }`. Élimination directe : le vainqueur `{ winner }`, sans score (on ne
 * garde en interne que 1-0 ou 0-1 pour faire avancer le tableau). Dans les deux : un forfait.
 * version : celle du résultat que l'écran affichait (0 s'il n'y en avait pas) ; voir setResult.
 */
export type ResultInput = (
  { a: number; b: number } | { winner: 'a' | 'b' } | { forfeit: 'a' | 'b' }
) & {
  version?: number;
};

interface Drawn {
  id: string;
  format: TournamentFormat;
  status: TournamentStatus;
  forfeitScore: number;
  allowDraws: boolean;
  drawSeed: string | null;
  drawPlayers: string[];
  drawLegs: number | null;
  drawnAt: Date | null;
  structure: unknown;
}

const drawnSelect = {
  id: true,
  format: true,
  status: true,
  forfeitScore: true,
  allowDraws: true,
  drawSeed: true,
  drawPlayers: true,
  drawLegs: true,
  drawnAt: true,
  structure: true,
} as const;

/** Le moteur lève `EngineError` pour une donnée invalide ou un état impossible : on le traduit. */
function engineConflict<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof EngineError) throw new ConflictException(error.message);
    throw error;
  }
}

function omitVersions<T extends { versions: unknown }>(view: T): Omit<T, 'versions'> {
  return Object.fromEntries(Object.entries(view).filter(([key]) => key !== 'versions')) as Omit<
    T,
    'versions'
  >;
}

/** Remplace un identifiant partout dans la structure JSON (les codes de match ne sont pas des uuid). */
function replaceId(value: unknown, from: string, to: string): unknown {
  if (value === from) return to;
  if (Array.isArray(value)) return value.map((v) => replaceId(v, from, to));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceId(v, from, to)]));
  }
  return value;
}

/**
 * Tirage, scores, forfaits et remplacements.
 *
 * Comme `TournamentsService`, chaque méthode reçoit le `groupId` vérifié par `GroupGuard` et ne
 * lit un tournoi qu'avec lui (R1). Toute écriture verrouille la ligne du tournoi : deux scores
 * saisis en même temps sont appliqués l'un après l'autre, jamais mélangés.
 */
@Injectable()
export class MatchesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TournamentsService) private readonly tournaments: TournamentsService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  /**
   * Tire au sort les joueurs ACCEPTÉS et PRÉSENTS. La graine est choisie par le serveur : l'admin
   * ne peut pas « essayer » des graines jusqu'à obtenir le tirage qu'il veut. Elle est publiée
   * avec la liste triée des joueurs, donc n'importe qui peut refaire le tirage et comparer.
   */
  async draw(groupId: string, actorId: string, tournamentId: string, legs: 1 | 2 = 1) {
    await this.prisma.$transaction(async (tx) => {
      assertHolder(await this.tournaments.lockTournament(tx, groupId, tournamentId), actorId);
      const tournament = await tx.tournament.findUniqueOrThrow({
        where: { id: tournamentId },
        select: { format: true, status: true },
      });
      if (tournament.status !== TournamentStatus.CHECK_IN) {
        throw new ConflictException(
          tournament.status === TournamentStatus.REGISTRATION
            ? 'Ouvrez le pointage avant le tirage'
            : 'Le tirage est déjà fait',
        );
      }
      const present = await tx.registration.findMany({
        where: {
          tournamentId,
          status: RegistrationStatus.ACCEPTED,
          presence: Presence.PRESENT,
        },
        select: { id: true },
      });
      if (present.length < 2) {
        throw new ConflictException('Il faut au moins 2 joueurs présents pour tirer au sort');
      }
      const ids = present.map((p) => p.id).sort();
      const seed = randomBytes(16).toString('hex');
      const isLeague = tournament.format === TournamentFormat.LEAGUE;
      const structure = isLeague ? buildLeague(ids, seed, { legs }) : buildBracket(ids, seed);
      await tx.tournament.update({
        where: { id: tournamentId },
        data: {
          status: TournamentStatus.STARTED,
          drawSeed: seed,
          drawPlayers: ids,
          drawLegs: isLeague ? legs : null,
          structure: structure as unknown as Prisma.InputJsonValue,
          drawnAt: new Date(),
        },
      });
      await this.events.record(tx, tournamentId, actorId, 'DRAW_DONE', {
        seed,
        players: ids.length,
        legs: isLeague ? legs : null,
      });
    });
    return this.get(groupId, tournamentId);
  }

  /** État complet : tableau ou calendrier, scores, classement, noms des joueurs. */
  async get(groupId: string, tournamentId: string) {
    return this.buildView(this.prisma, groupId, tournamentId);
  }

  /** Saisit ou corrige un score, ou un forfait (le vainqueur reçoit le score par défaut du tournoi). */
  async setResult(
    groupId: string,
    actorId: string,
    tournamentId: string,
    code: string,
    input: ResultInput,
  ) {
    await this.prisma.$transaction(async (tx) => {
      assertHolder(await this.tournaments.lockTournament(tx, groupId, tournamentId), actorId);
      const t = await this.drawnTournament(tx, tournamentId);
      const matchIds = this.matchCodes(t);
      if (!matchIds.has(code)) throw new NotFoundException(MATCH_NOT_FOUND);

      const isBracket = t.format === TournamentFormat.ELIMINATION;
      if ('winner' in input && !isBracket) {
        throw new BadRequestException('Une ligue demande le score du match');
      }
      if ('a' in input && isBracket) {
        throw new BadRequestException(
          'En élimination directe, désignez le vainqueur : pas de score',
        );
      }
      const score: Score =
        'forfeit' in input
          ? input.forfeit === 'a'
            ? { a: 0, b: t.forfeitScore }
            : { a: t.forfeitScore, b: 0 }
          : 'winner' in input
            ? input.winner === 'a'
              ? { a: 1, b: 0 }
              : { a: 0, b: 1 }
            : { a: input.a, b: input.b };
      try {
        assertScore(code, score, { allowDraw: !isBracket && t.allowDraws });
      } catch (error) {
        if (error instanceof EngineError) throw new BadRequestException(error.message);
        throw error;
      }

      const current = await this.scores(tx, tournamentId);
      const next = { ...current, [code]: score };
      if (t.format === TournamentFormat.ELIMINATION) {
        const bracket = t.structure as Bracket;
        const before = resolveBracket(bracket, current);
        const after = engineConflict(() => resolveBracket(bracket, next));
        this.assertDownstreamFree(bracket, before, after, code, current);
      } else {
        this.leagueView(t, next); // valide les scores contre le calendrier
      }

      const forfeitBy = 'forfeit' in input ? (input.forfeit === 'a' ? Side.A : Side.B) : null;
      // Version optimiste : un écran périmé (le score a changé depuis) ne peut pas l'écraser.
      const existing = await tx.matchResult.findUnique({
        where: { tournamentId_code: { tournamentId, code } },
        select: { version: true },
      });
      if (input.version !== undefined && input.version !== (existing?.version ?? 0)) {
        throw new ConflictException('Ce score a changé depuis : rechargez la page');
      }
      const version = (existing?.version ?? 0) + 1;
      await tx.matchResult.upsert({
        where: { tournamentId_code: { tournamentId, code } },
        create: { tournamentId, code, scoreA: score.a, scoreB: score.b, forfeitBy, version },
        update: { scoreA: score.a, scoreB: score.b, forfeitBy, version },
      });
      // Élimination : on note le vainqueur, pas le 1-0 interne. Ligue : le score réel.
      await this.events.record(
        tx,
        tournamentId,
        actorId,
        'RESULT_SET',
        isBracket
          ? { code, winner: score.a > score.b ? 'a' : 'b', forfeitBy, version }
          : { code, a: score.a, b: score.b, forfeitBy, version },
      );
      await this.syncStatus(tx, t, next);
    });
    return this.get(groupId, tournamentId);
  }

  /** Annule un score saisi par erreur, tant que le match suivant n'a pas de résultat. */
  async deleteResult(groupId: string, actorId: string, tournamentId: string, code: string) {
    await this.prisma.$transaction(async (tx) => {
      assertHolder(await this.tournaments.lockTournament(tx, groupId, tournamentId), actorId);
      const t = await this.drawnTournament(tx, tournamentId);
      if (!this.matchCodes(t).has(code)) throw new NotFoundException(MATCH_NOT_FOUND);
      const current = await this.scores(tx, tournamentId);
      if (!(code in current)) throw new NotFoundException('Aucun score à annuler');

      const rest = Object.fromEntries(Object.entries(current).filter(([key]) => key !== code));
      if (t.format === TournamentFormat.ELIMINATION) {
        const bracket = t.structure as Bracket;
        // Retirer un score retire le vainqueur du match : le match suivant ne doit pas être joué.
        this.assertNextNotPlayed(bracket, code, current);
      }
      await tx.matchResult.delete({ where: { tournamentId_code: { tournamentId, code } } });
      await this.events.record(tx, tournamentId, actorId, 'RESULT_DELETED', { code });
      await this.syncStatus(tx, t, rest);
    });
    return this.get(groupId, tournamentId);
  }

  /**
   * Remplace un joueur du tirage par un joueur de la liste d'attente (ou arrivé en retard), tant
   * que le joueur remplacé n'a joué aucun match. La graine et la liste d'origine ne changent pas :
   * le tirage reste vérifiable, et le remplacement est visible (le joueur remplacé reste listé).
   */
  async replacePlayer(
    groupId: string,
    actorId: string,
    tournamentId: string,
    outId: string,
    inId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      assertHolder(await this.tournaments.lockTournament(tx, groupId, tournamentId), actorId);
      const t = await this.drawnTournament(tx, tournamentId);
      if (t.status !== TournamentStatus.STARTED) {
        throw new ConflictException('Le tournoi est terminé : plus de remplacement possible');
      }
      const players = this.playersIn(t);
      if (!players.has(outId)) throw new NotFoundException('Joueur à remplacer introuvable');
      if (outId === inId) throw new BadRequestException('Choisissez un autre joueur');
      if (players.has(inId)) throw new ConflictException('Ce joueur est déjà dans le tirage');

      const incoming = await tx.registration.findFirst({
        where: {
          id: inId,
          tournamentId,
          status: { in: [RegistrationStatus.ACCEPTED, RegistrationStatus.WAITLIST] },
        },
        select: { id: true },
      });
      if (!incoming) throw new NotFoundException('Joueur remplaçant introuvable');

      const current = await this.scores(tx, tournamentId);
      for (const [code, who] of this.playersByMatch(t, current)) {
        if (code in current && who.includes(outId)) {
          throw new ConflictException('Ce joueur a déjà joué : impossible de le remplacer');
        }
      }

      await tx.tournament.update({
        where: { id: tournamentId },
        data: { structure: replaceId(t.structure, outId, inId) as Prisma.InputJsonValue },
      });
      await tx.registration.update({
        where: { id: outId },
        data: { status: RegistrationStatus.REPLACED },
      });
      await tx.registration.update({
        where: { id: inId },
        data: { status: RegistrationStatus.ACCEPTED, presence: Presence.PRESENT },
      });
      await this.events.record(tx, tournamentId, actorId, 'PLAYER_REPLACED', { outId, inId });
    });
    return this.get(groupId, tournamentId);
  }

  // ---------------------------------------------------------------------------------------------

  private async drawnTournament(tx: Tx, tournamentId: string): Promise<Drawn> {
    const t = await tx.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
      select: drawnSelect,
    });
    if (!t.structure) throw new ConflictException(NOT_DRAWN);
    return t;
  }

  private async scores(tx: Tx, tournamentId: string): Promise<Record<string, Score>> {
    const rows = await tx.matchResult.findMany({ where: { tournamentId } });
    return Object.fromEntries(rows.map((r) => [r.code, { a: r.scoreA, b: r.scoreB }]));
  }

  private matchCodes(t: Drawn): Set<string> {
    return new Set(this.playersByMatch(t).keys());
  }

  /**
   * Pour chaque match, les joueurs connus. En élimination, les joueurs d'un tour suivant dépendent
   * des scores déjà saisis : on les résout avec `results`.
   */
  private playersByMatch(t: Drawn, results: Record<string, Score> = {}): Map<string, string[]> {
    const out = new Map<string, string[]>();
    if (t.format === TournamentFormat.LEAGUE) {
      for (const m of (t.structure as League).rounds.flat()) out.set(m.id, [m.a, m.b]);
      return out;
    }
    const resolved = resolveBracket(t.structure as Bracket, results);
    for (const m of resolved.rounds.flat()) {
      out.set(
        m.id,
        [m.a, m.b].filter((x): x is string => x !== null),
      );
    }
    return out;
  }

  /** Tous les joueurs du tirage actuel. */
  private playersIn(t: Drawn): Set<string> {
    return new Set(
      t.format === TournamentFormat.LEAGUE
        ? (t.structure as League).draw
        : (t.structure as Bracket).draw,
    );
  }

  /**
   * Changer le vainqueur d'un match (ou retirer son score) change l'adversaire du match suivant :
   * c'est refusé si ce match suivant a déjà un résultat.
   */
  private assertDownstreamFree(
    bracket: Bracket,
    before: ReturnType<typeof resolveBracket>,
    after: ReturnType<typeof resolveBracket>,
    code: string,
    results: Record<string, Score>,
  ) {
    const winner = (r: typeof before) => r.rounds.flat().find((m) => m.id === code)?.winner ?? null;
    if (winner(before) === winner(after)) return;
    this.assertNextNotPlayed(bracket, code, results);
  }

  private assertNextNotPlayed(bracket: Bracket, code: string, results: Record<string, Score>) {
    const next = bracket.rounds
      .flat()
      .find(
        (m) =>
          (m.a.kind === 'winner-of' && m.a.matchId === code) ||
          (m.b.kind === 'winner-of' && m.b.matchId === code),
      );
    if (next && next.id in results) {
      throw new ConflictException(
        'Le match suivant a déjà un score : corrigez-le d’abord (le vainqueur de ce match change)',
      );
    }
  }

  private async syncStatus(tx: Tx, t: Drawn, results: Record<string, Score>) {
    const finished =
      t.format === TournamentFormat.ELIMINATION
        ? resolveBracket(t.structure as Bracket, results).champion !== null
        : computeStandings(t.structure as League, results, { allowDraws: t.allowDraws }).complete;
    await tx.tournament.update({
      where: { id: t.id },
      data: { status: finished ? TournamentStatus.FINISHED : TournamentStatus.STARTED },
    });
  }

  private leagueView(t: Drawn, results: Record<string, Score>) {
    return engineConflict(() =>
      computeStandings(t.structure as League, results, { allowDraws: t.allowDraws }),
    );
  }

  /**
   * Vue publique en lecture seule, trouvée par le lien du tournoi. Elle ne montre ni les inscriptions
   * en attente, ni les versions de score, ni qui tient la main : seulement ce qu'un spectateur voit.
   * Le nombre d'événements du journal (`revision`) est lu AVANT la vue : la vue est au moins aussi
   * récente que lui, ce qui permet au client de savoir s'il a raté un changement.
   */
  async publicView(slug: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { publicSlug: slug },
      select: {
        id: true,
        groupId: true,
        name: true,
        format: true,
        status: true,
        language: true,
        startsAt: true,
        structure: true,
      },
    });
    if (!t) throw new NotFoundException('Tournoi introuvable');
    const revision = await this.prisma.tournamentEvent.count({ where: { tournamentId: t.id } });
    const head = {
      name: t.name,
      format: t.format,
      status: t.status,
      language: t.language,
      startsAt: t.startsAt,
      registrationOpen: t.status === TournamentStatus.REGISTRATION,
      revision,
    };
    if (!t.structure) {
      const players = await this.prisma.registration.findMany({
        where: { tournamentId: t.id, status: { not: RegistrationStatus.PENDING } },
        select: { id: true, platoName: true, status: true },
        orderBy: { createdAt: 'asc' },
      });
      return { ...head, drawn: false as const, players };
    }
    const view = await this.buildView(this.prisma, t.groupId, t.id);
    // Les versions servent aux admins (anti-écrasement) : un spectateur n'en a pas besoin.
    return { ...head, ...omitVersions(view), drawn: true as const };
  }

  private async buildView(db: Tx, groupId: string, tournamentId: string) {
    // `groupId` dans la requête : un tournoi d'un autre groupe est introuvable (R1).
    const t = await db.tournament.findFirst({
      where: { id: tournamentId, groupId },
      select: drawnSelect,
    });
    if (!t) throw new NotFoundException('Tournoi introuvable');
    if (!t.structure) throw new NotFoundException(NOT_DRAWN);

    const rows = await db.matchResult.findMany({ where: { tournamentId } });
    const scores: Record<string, Score> = Object.fromEntries(
      rows.map((r) => [r.code, { a: r.scoreA, b: r.scoreB }]),
    );
    const players = await db.registration.findMany({
      where: { tournamentId, status: { not: RegistrationStatus.PENDING } },
      select: { id: true, platoName: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
    const common = {
      format: t.format,
      status: t.status,
      seed: t.drawSeed,
      drawnAt: t.drawnAt,
      /** Liste triée utilisée pour le tirage : avec la graine, elle permet de le refaire. */
      initialPlayers: t.drawPlayers,
      forfeitScore: t.forfeitScore,
      /** Ligue : les scores à égalité sont acceptés (choisi à la création du tournoi). */
      allowDraws: t.allowDraws,
      players,
      /** Version de chaque score : à renvoyer en le corrigeant (voir setResult). */
      versions: Object.fromEntries(rows.map((r) => [r.code, r.version])),
      forfeits: Object.fromEntries(
        rows.filter((r) => r.forfeitBy).map((r) => [r.code, r.forfeitBy]),
      ),
    };

    if (t.format === TournamentFormat.LEAGUE) {
      const league = t.structure as unknown as League;
      return {
        ...common,
        schedule: { legs: league.legs, rounds: league.rounds, rests: league.rests },
        scores,
        standings: computeStandings(league, scores, { allowDraws: t.allowDraws }),
      };
    }
    const bracket = t.structure as unknown as Bracket;
    const resolved = resolveBracket(bracket, scores);
    return {
      ...common,
      bracket: { size: bracket.size, byes: bracket.byes, rounds: resolved.rounds },
      champion: resolved.champion,
    };
  }
}
