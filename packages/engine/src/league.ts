import { assertScore, EngineError, type Score } from './bracket';
import { createRandom, shuffle } from './prng';

export interface LeagueMatch {
  /** Identifiant stable, par exemple `R2M3` (journée 2, match 3). */
  id: string;
  /** Numéro de la journée, à partir de 1. */
  round: number;
  /** Position dans la journée, à partir de 1. */
  index: number;
  a: string;
  b: string;
}

export interface League {
  seed: string;
  /** Joueurs dans l'ordre du tirage (sert aussi de dernier départage). */
  draw: string[];
  /** 1 = chacun rencontre chaque adversaire une fois ; 2 = matchs aller et retour. */
  legs: 1 | 2;
  /** Une liste de matchs par journée. */
  rounds: LeagueMatch[][];
  /** Joueur qui se repose à chaque journée (`null` s'il y a un nombre pair de joueurs). */
  rests: (string | null)[];
}

export interface LeagueOptions {
  legs?: 1 | 2;
}

/**
 * Construit le calendrier d'une ligue (tournoi à la ronde) par la méthode des cercles.
 *
 * - Chaque joueur rencontre chaque adversaire exactement une fois (deux avec `legs: 2`).
 * - Avec un nombre impair de joueurs, un joueur se repose à chaque journée et le repos tourne :
 *   chacun se repose exactement une fois par aller.
 * - Le tirage est vérifiable : mêmes joueurs + même graine = même calendrier, quel que soit
 *   l'ordre d'inscription.
 */
export function buildLeague(
  playerIds: readonly string[],
  seed: string,
  options: LeagueOptions = {},
): League {
  const legs = options.legs ?? 1;
  if (seed.trim() === '') throw new EngineError('La graine du tirage est obligatoire.');
  if (playerIds.length < 2) throw new EngineError('Il faut au moins 2 joueurs.');
  if (new Set(playerIds).size !== playerIds.length) {
    throw new EngineError('Un joueur apparaît plusieurs fois dans la liste.');
  }

  const draw = shuffle(
    [...playerIds].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)),
    createRandom(seed),
  );

  // Méthode des cercles : on fixe la première place et on fait tourner les autres.
  const circle: (string | null)[] = [...draw];
  if (circle.length % 2 === 1) circle.push(null);
  const n = circle.length;

  const leg1: LeagueMatch[][] = [];
  const rests: (string | null)[] = [];
  for (let r = 0; r < n - 1; r++) {
    const matches: LeagueMatch[] = [];
    let rest: string | null = null;
    for (let i = 0; i < n / 2; i++) {
      const home = circle[i] ?? null;
      const away = circle[n - 1 - i] ?? null;
      if (home === null || away === null) {
        rest = home ?? away;
        continue;
      }
      // On alterne a et b d'une journée à l'autre pour la première table, par équité.
      const swap = i === 0 && r % 2 === 1;
      matches.push({
        id: '',
        round: r + 1,
        index: matches.length + 1,
        a: swap ? away : home,
        b: swap ? home : away,
      });
    }
    leg1.push(matches.map((m) => ({ ...m, id: `R${m.round}M${m.index}` })));
    rests.push(rest);
    // Rotation : le dernier passe en deuxième position.
    circle.splice(1, 0, circle.pop() as string | null);
  }

  const rounds = [...leg1];
  const allRests = [...rests];
  if (legs === 2) {
    leg1.forEach((matches, r) => {
      const round = leg1.length + r + 1;
      rounds.push(
        matches.map((m) => ({
          id: `R${round}M${m.index}`,
          round,
          index: m.index,
          a: m.b,
          b: m.a,
        })),
      );
      allRests.push(rests[r] ?? null);
    });
  }

  return { seed, draw, legs, rounds, rests: allRests };
}

// ---------------------------------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------------------------------

export interface StandingsOptions {
  /** Points pour une victoire (3 par défaut). */
  pointsForWin?: number;
  /** Points pour une défaite (0 par défaut). */
  pointsForLoss?: number;
  /** Points de chacun pour un match nul (1 par défaut). */
  pointsForDraw?: number;
  /** Autorise les scores à égalité (le tournoi le décide à sa création) ; refusés par défaut. */
  allowDraws?: boolean;
}

export interface StandingRow {
  playerId: string;
  /** Rang de 1 à N, toujours unique : les égalités parfaites sont tranchées par l'ordre du tirage. */
  rank: number;
  played: number;
  wins: number;
  /** Matchs nuls (toujours 0 si le tournoi ne les autorise pas). */
  draws: number;
  losses: number;
  /** Manches (ou points) marqués et encaissés, selon ce que l'admin saisit comme score. */
  scoreFor: number;
  scoreAgainst: number;
  scoreDiff: number;
  points: number;
}

export interface Standings {
  rows: StandingRow[];
  /** Matchs joués et matchs au calendrier. */
  played: number;
  total: number;
  /** `true` quand tous les matchs sont joués. */
  complete: boolean;
}

/**
 * Calcule le classement à partir des scores saisis.
 *
 * Ordre des départages :
 * 1. points de classement ;
 * 2. confrontations directes (mini-classement entre les joueurs à égalité) ;
 * 3. différence de score (2-1 compte +1 pour le vainqueur) ;
 * 4. score marqué ;
 * 5. ordre du tirage (déterministe, public via la graine).
 */
export function computeStandings(
  league: League,
  results: Readonly<Record<string, Score>>,
  options: StandingsOptions = {},
): Standings {
  const win = options.pointsForWin ?? 3;
  const loss = options.pointsForLoss ?? 0;
  const tie = options.pointsForDraw ?? 1;
  const allowDraw = options.allowDraws === true;

  const matches = league.rounds.flat();
  const known = new Set(matches.map((m) => m.id));
  for (const id of Object.keys(results)) {
    if (!known.has(id)) throw new EngineError(`Résultat pour un match inconnu : ${id}.`);
  }

  const table = new Map<string, Omit<StandingRow, 'rank'>>(
    league.draw.map((playerId) => [
      playerId,
      {
        playerId,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        scoreDiff: 0,
        points: 0,
      },
    ]),
  );
  const done: { a: string; b: string; score: Score }[] = [];

  for (const m of matches) {
    const score = results[m.id];
    if (!score) continue;
    assertScore(m.id, score, { allowDraw });
    done.push({ a: m.a, b: m.b, score });
    const aWins = score.a > score.b;
    const rowA = table.get(m.a);
    const rowB = table.get(m.b);
    if (!rowA || !rowB) throw new EngineError(`Joueur inconnu dans ${m.id}.`);
    rowA.played++;
    rowB.played++;
    rowA.scoreFor += score.a;
    rowA.scoreAgainst += score.b;
    rowB.scoreFor += score.b;
    rowB.scoreAgainst += score.a;
    if (score.a === score.b) {
      rowA.draws++;
      rowB.draws++;
      rowA.points += tie;
      rowB.points += tie;
    } else if (aWins) {
      rowA.wins++;
      rowB.losses++;
      rowA.points += win;
      rowB.points += loss;
    } else {
      rowB.wins++;
      rowA.losses++;
      rowB.points += win;
      rowA.points += loss;
    }
  }
  for (const row of table.values()) row.scoreDiff = row.scoreFor - row.scoreAgainst;

  const drawIndex = new Map(league.draw.map((id, i) => [id, i]));
  const idx = (id: string) => drawIndex.get(id) ?? 0;

  /** Points obtenus uniquement dans les matchs entre les joueurs du groupe. */
  const headToHead = (group: Set<string>): Map<string, number> => {
    const pts = new Map<string, number>([...group].map((id) => [id, 0]));
    for (const g of done) {
      if (!group.has(g.a) || !group.has(g.b)) continue;
      if (g.score.a === g.score.b) {
        pts.set(g.a, (pts.get(g.a) ?? 0) + tie);
        pts.set(g.b, (pts.get(g.b) ?? 0) + tie);
        continue;
      }
      const winner = g.score.a > g.score.b ? g.a : g.b;
      const loser = winner === g.a ? g.b : g.a;
      pts.set(winner, (pts.get(winner) ?? 0) + win);
      pts.set(loser, (pts.get(loser) ?? 0) + loss);
    }
    return pts;
  };

  const byPoints = [...table.values()].sort((x, y) => y.points - x.points);
  const ordered: Omit<StandingRow, 'rank'>[] = [];
  for (let i = 0; i < byPoints.length;) {
    let j = i + 1;
    while (j < byPoints.length && byPoints[j]?.points === byPoints[i]?.points) j++;
    const group = byPoints.slice(i, j);
    if (group.length > 1) {
      const h2h = headToHead(new Set(group.map((r) => r.playerId)));
      group.sort(
        (x, y) =>
          (h2h.get(y.playerId) ?? 0) - (h2h.get(x.playerId) ?? 0) ||
          y.scoreDiff - x.scoreDiff ||
          y.scoreFor - x.scoreFor ||
          idx(x.playerId) - idx(y.playerId),
      );
    }
    ordered.push(...group);
    i = j;
  }

  return {
    rows: ordered.map((row, i) => ({ ...row, rank: i + 1 })),
    played: done.length,
    total: matches.length,
    complete: done.length === matches.length,
  };
}
