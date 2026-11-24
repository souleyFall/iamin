import { createRandom, shuffle } from './prng';

/** Erreur levée quand les données reçues ne permettent pas de construire ou de lire un tableau. */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

/** Ce qui occupe une place d'un match : un joueur, un bye, ou le vainqueur d'un match précédent. */
export type Slot =
  { kind: 'player'; playerId: string } | { kind: 'bye' } | { kind: 'winner-of'; matchId: string };

export interface BracketMatch {
  /** Identifiant stable, par exemple `R1M3` (tour 1, match 3). */
  id: string;
  /** Numéro du tour, à partir de 1. Le dernier tour est la finale. */
  round: number;
  /** Position dans le tour, à partir de 1. */
  index: number;
  a: Slot;
  b: Slot;
}

export interface Bracket {
  seed: string;
  /** Joueurs dans l'ordre du tirage : le premier est la tête de série n°1. */
  draw: string[];
  /** Taille du tableau : la plus petite puissance de deux au moins égale au nombre de joueurs. */
  size: number;
  /** Nombre de byes : `size - joueurs`. */
  byes: number;
  rounds: BracketMatch[][];
}

/**
 * Ordre standard des places pour un tableau de `size` places : les têtes de série 1 et 2 ne
 * peuvent se rencontrer qu'en finale, 1-4 et 2-3 en demi-finale, etc.
 * Ex. pour 8 : [1, 8, 4, 5, 2, 7, 3, 6].
 */
export function seedOrder(size: number): number[] {
  if (!Number.isInteger(size) || size < 2 || (size & (size - 1)) !== 0) {
    throw new EngineError('La taille du tableau doit être une puissance de deux, au moins 2.');
  }
  let order = [1, 2];
  while (order.length < size) {
    const total = order.length * 2;
    order = order.flatMap((s) => [s, total + 1 - s]);
  }
  return order;
}

function nextPowerOfTwo(n: number): number {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/**
 * Tire au sort les joueurs et construit le tableau d'élimination directe.
 *
 * - Le tirage est vérifiable : les identifiants sont triés avant le mélange, donc le résultat ne
 *   dépend que de la liste des joueurs et de la graine, jamais de l'ordre d'inscription.
 * - Les byes vont aux têtes de série les mieux placées, c'est-à-dire à des joueurs tirés au sort :
 *   personne n'est avantagé à l'avance.
 * - Il n'y a jamais deux byes dans le même match, et jamais de bye après le premier tour.
 */
export function buildBracket(playerIds: readonly string[], seed: string): Bracket {
  if (seed.trim() === '') throw new EngineError('La graine du tirage est obligatoire.');
  if (playerIds.length < 2) throw new EngineError('Il faut au moins 2 joueurs.');
  if (new Set(playerIds).size !== playerIds.length) {
    throw new EngineError('Un joueur apparaît plusieurs fois dans la liste.');
  }

  const draw = shuffle(
    [...playerIds].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)),
    createRandom(seed),
  );
  const size = nextPowerOfTwo(draw.length);
  const order = seedOrder(size);

  const slotFor = (seedNumber: number): Slot => {
    const playerId = draw[seedNumber - 1];
    return playerId === undefined ? { kind: 'bye' } : { kind: 'player', playerId };
  };

  const rounds: BracketMatch[][] = [];
  const first: BracketMatch[] = [];
  for (let i = 0; i < size; i += 2) {
    const index = i / 2 + 1;
    first.push({
      id: `R1M${index}`,
      round: 1,
      index,
      a: slotFor(order[i] as number),
      b: slotFor(order[i + 1] as number),
    });
  }
  rounds.push(first);

  let previous = first;
  for (let round = 2; previous.length > 1; round++) {
    const current: BracketMatch[] = [];
    for (let i = 0; i < previous.length; i += 2) {
      const index = i / 2 + 1;
      current.push({
        id: `R${round}M${index}`,
        round,
        index,
        a: { kind: 'winner-of', matchId: (previous[i] as BracketMatch).id },
        b: { kind: 'winner-of', matchId: (previous[i + 1] as BracketMatch).id },
      });
    }
    rounds.push(current);
    previous = current;
  }

  return { seed, draw, size, byes: size - draw.length, rounds };
}

// ---------------------------------------------------------------------------------------------
// Résultats
// ---------------------------------------------------------------------------------------------

/** Score final d'un match, du point de vue de `a` et de `b` (ex. 2-1 dans un match au meilleur de 3). */
export interface Score {
  a: number;
  b: number;
}

export type MatchStatus = 'bye' | 'waiting' | 'ready' | 'done';

export interface ResolvedMatch {
  id: string;
  round: number;
  index: number;
  /** `null` tant que le match précédent n'est pas terminé. */
  a: string | null;
  b: string | null;
  /** `true` si la place est un bye (le joueur de l'autre côté passe sans jouer). */
  aBye: boolean;
  bBye: boolean;
  winner: string | null;
  status: MatchStatus;
  score: Score | null;
}

export interface ResolvedBracket {
  rounds: ResolvedMatch[][];
  /** Vainqueur du tournoi, une fois la finale jouée. */
  champion: string | null;
}

export function assertScore(
  matchId: string,
  score: Score,
  options: { allowDraw?: boolean } = {},
): void {
  const valid = (n: number) => Number.isInteger(n) && n >= 0;
  if (!valid(score.a) || !valid(score.b)) {
    throw new EngineError(`Score invalide pour ${matchId} : des entiers positifs sont attendus.`);
  }
  // Une élimination ne tolère jamais l'égalité ; une ligue seulement si le tournoi l'autorise.
  if (score.a === score.b && options.allowDraw !== true) {
    throw new EngineError(`Score invalide pour ${matchId} : un match ne peut pas finir à égalité.`);
  }
}

/**
 * Applique les scores saisis au tableau et fait avancer les vainqueurs.
 * Fonction pure : le tableau et les résultats ne sont jamais modifiés.
 * Refuse un score pour un match inconnu, un bye, ou un match dont les joueurs ne sont pas connus.
 */
export function resolveBracket(
  bracket: Bracket,
  results: Readonly<Record<string, Score>>,
): ResolvedBracket {
  const known = new Set(bracket.rounds.flat().map((m) => m.id));
  for (const id of Object.keys(results)) {
    if (!known.has(id)) throw new EngineError(`Résultat pour un match inconnu : ${id}.`);
  }

  const winners = new Map<string, string>();
  const rounds: ResolvedMatch[][] = [];

  for (const round of bracket.rounds) {
    const resolvedRound: ResolvedMatch[] = [];
    for (const match of round) {
      const side = (slot: Slot): { id: string | null; bye: boolean } => {
        if (slot.kind === 'player') return { id: slot.playerId, bye: false };
        if (slot.kind === 'bye') return { id: null, bye: true };
        return { id: winners.get(slot.matchId) ?? null, bye: false };
      };
      const a = side(match.a);
      const b = side(match.b);
      const score = results[match.id] ?? null;

      let status: MatchStatus;
      let winner: string | null = null;

      if (a.bye || b.bye) {
        if (score) throw new EngineError(`${match.id} est un bye : aucun score n'est possible.`);
        status = 'bye';
        winner = a.bye ? b.id : a.id;
      } else if (a.id === null || b.id === null) {
        if (score) {
          throw new EngineError(`${match.id} n'a pas encore ses deux joueurs : score refusé.`);
        }
        status = 'waiting';
      } else if (score) {
        assertScore(match.id, score);
        status = 'done';
        winner = score.a > score.b ? a.id : b.id;
      } else {
        status = 'ready';
      }

      if (winner !== null) winners.set(match.id, winner);
      resolvedRound.push({
        id: match.id,
        round: match.round,
        index: match.index,
        a: a.id,
        b: b.id,
        aBye: a.bye,
        bBye: b.bye,
        winner,
        status,
        score,
      });
    }
    rounds.push(resolvedRound);
  }

  const final = rounds[rounds.length - 1]?.[0];
  return { rounds, champion: final?.winner ?? null };
}
