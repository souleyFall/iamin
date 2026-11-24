import type { ResolvedBracket, ResolvedMatch, Score } from './bracket';
import type { League, Standings } from './league';

/**
 * Générateurs de texte à copier-coller dans le chat Plato.
 *
 * Texte brut uniquement (pas de Markdown, pas d'HTML) : une ligne par information, lisible
 * sur mobile. Les pseudos viennent d'inscriptions publiques : ils sont nettoyés (retours à la
 * ligne et caractères de contrôle supprimés) pour qu'un pseudo ne puisse pas fausser le message
 * copié ni y glisser de fausses lignes.
 *
 * Langue : français par défaut ; anglais et espagnol avec le paramètre `locale`. Le texte est
 * celui que les JOUEURS lisent dans le chat de leur serveur Plato : il suit la langue du tournoi,
 * pas celle de l'écran de l'admin.
 */

export type Locale = 'fr' | 'en' | 'es';
export const LOCALES: readonly Locale[] = ['fr', 'en', 'es'];

/** Les phrases du chat dans chaque langue. Les nombres et les noms sont insérés par les fonctions. */
interface Phrases {
  toBeDetermined: string;
  registered: (n: number) => string;
  places: (n: number, capacity: number) => string;
  registrationsHeading: (places: string) => string;
  noRegistered: string;
  waitlist: (n: number) => string;
  final: string;
  semiFinals: string;
  quarterFinals: string;
  round: (n: number) => string;
  bye: (player: string) => string;
  matchday: (n: number, total: number) => string;
  rest: (player: string) => string;
  wins: (player: string) => string;
  /** Match nul : le score est à égalité. */
  drawn: string;
  /** Élimination : pas de score, seulement le vainqueur. */
  beats: (winner: string, loser: string) => string;
  resultsRound: (round: string) => string;
  resultsMatchday: (n: number, total: number) => string;
  noResults: string;
  champion: (player: string) => string;
  standings: (state: string) => string;
  standingsFinal: string;
  standingsProgress: (played: number, total: number) => string;
  standingsRow: (
    rank: number,
    player: string,
    points: number,
    wins: number,
    losses: number,
    diff: string,
    draws: number,
  ) => string;
}

const PHRASES: Record<Locale, Phrases> = {
  fr: {
    toBeDetermined: 'à déterminer',
    registered: (n) => `${n} inscrit${n > 1 ? 's' : ''}`,
    places: (n, capacity) => `${n}/${capacity} places`,
    registrationsHeading: (places) => `Inscrits : ${places}`,
    noRegistered: 'Aucun inscrit pour le moment.',
    waitlist: (n) => `Liste d'attente : ${n}`,
    final: 'Finale',
    semiFinals: 'Demi-finales',
    quarterFinals: 'Quarts de finale',
    round: (n) => `Tour ${n}`,
    bye: (player) => `${player} : exempt (bye)`,
    matchday: (n, total) => `Journée ${n}/${total}`,
    rest: (player) => `Repos : ${player}`,
    wins: (player) => `victoire de ${player}`,
    drawn: 'match nul',
    beats: (winner, loser) => `${winner} bat ${loser}`,
    resultsRound: (round) => `Résultats : ${round}`,
    resultsMatchday: (n, total) => `Résultats : journée ${n}/${total}`,
    noResults: 'Aucun résultat pour le moment.',
    champion: (player) => `Vainqueur du tournoi : ${player}`,
    standings: (state) => `Classement (${state})`,
    standingsFinal: 'classement final',
    standingsProgress: (played, total) => `${played}/${total} matchs joués`,
    standingsRow: (rank, player, points, wins, losses, diff, draws) =>
      `${rank}. ${player} : ${points} pts (${wins}V ${draws > 0 ? `${draws}N ` : ''}${losses}D, ${diff})`,
  },
  en: {
    toBeDetermined: 'to be determined',
    registered: (n) => `${n} registered`,
    places: (n, capacity) => `${n}/${capacity} spots`,
    registrationsHeading: (places) => `Registered: ${places}`,
    noRegistered: 'No one registered yet.',
    waitlist: (n) => `Waiting list: ${n}`,
    final: 'Final',
    semiFinals: 'Semi-finals',
    quarterFinals: 'Quarter-finals',
    round: (n) => `Round ${n}`,
    bye: (player) => `${player}: bye`,
    matchday: (n, total) => `Matchday ${n}/${total}`,
    rest: (player) => `Rest: ${player}`,
    wins: (player) => `${player} wins`,
    drawn: 'draw',
    beats: (winner, loser) => `${winner} beat ${loser}`,
    resultsRound: (round) => `Results: ${round}`,
    resultsMatchday: (n, total) => `Results: matchday ${n}/${total}`,
    noResults: 'No results yet.',
    champion: (player) => `Tournament winner: ${player}`,
    standings: (state) => `Standings (${state})`,
    standingsFinal: 'final standings',
    standingsProgress: (played, total) => `${played}/${total} matches played`,
    standingsRow: (rank, player, points, wins, losses, diff, draws) =>
      `${rank}. ${player}: ${points} pts (${wins}W ${draws > 0 ? `${draws}D ` : ''}${losses}L, ${diff})`,
  },
  es: {
    toBeDetermined: 'por determinar',
    registered: (n) => `${n} inscrito${n > 1 ? 's' : ''}`,
    places: (n, capacity) => `${n}/${capacity} plazas`,
    registrationsHeading: (places) => `Inscritos: ${places}`,
    noRegistered: 'Nadie inscrito por ahora.',
    waitlist: (n) => `Lista de espera: ${n}`,
    final: 'Final',
    semiFinals: 'Semifinales',
    quarterFinals: 'Cuartos de final',
    round: (n) => `Ronda ${n}`,
    bye: (player) => `${player}: pase directo (bye)`,
    matchday: (n, total) => `Jornada ${n}/${total}`,
    rest: (player) => `Descansa: ${player}`,
    wins: (player) => `gana ${player}`,
    drawn: 'empate',
    beats: (winner, loser) => `${winner} vence a ${loser}`,
    resultsRound: (round) => `Resultados: ${round}`,
    resultsMatchday: (n, total) => `Resultados: jornada ${n}/${total}`,
    noResults: 'Sin resultados por ahora.',
    champion: (player) => `Ganador del torneo: ${player}`,
    standings: (state) => `Clasificación (${state})`,
    standingsFinal: 'clasificación final',
    standingsProgress: (played, total) => `${played}/${total} partidos jugados`,
    standingsRow: (rank, player, points, wins, losses, diff, draws) =>
      `${rank}. ${player}: ${points} pts (${wins}G ${draws > 0 ? `${draws}E ` : ''}${losses}P, ${diff})`,
  },
};

/** Table identifiant du joueur → pseudo affiché. */
export type Names = Readonly<Record<string, string>>;

/** Nettoie un pseudo pour l'affichage dans une ligne de chat. */
export function cleanName(raw: string): string {
  return raw
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameOf(names: Names, id: string | null, p: Phrases): string {
  if (id === null) return p.toBeDetermined;
  const raw = names[id];
  const cleaned = raw === undefined ? '' : cleanName(raw);
  return cleaned === '' ? id : cleaned;
}

function heading(title: string | undefined, subtitle: string): string[] {
  const t = title === undefined ? '' : cleanName(title);
  return t === '' ? [subtitle] : [t, subtitle];
}

// ---------------------------------------------------------------------------------------------
// Inscrits
// ---------------------------------------------------------------------------------------------

export interface RegistrationsInput {
  title?: string;
  /** Joueurs acceptés, dans l'ordre d'inscription. */
  accepted: readonly string[];
  /** Liste d'attente, dans l'ordre d'arrivée. */
  waitlist?: readonly string[];
  /** Nombre de places, si le tournoi en limite le nombre. */
  capacity?: number;
  /** Langue du texte (français par défaut). */
  locale?: Locale;
}

/** Liste des inscrits (et de la liste d'attente) à publier dans le chat. */
export function formatRegistrations(input: RegistrationsInput): string {
  const p = PHRASES[input.locale ?? 'fr'];
  const accepted = input.accepted.map(cleanName);
  const waitlist = (input.waitlist ?? []).map(cleanName);
  const places =
    input.capacity === undefined
      ? p.registered(accepted.length)
      : p.places(accepted.length, input.capacity);

  const lines = heading(input.title, p.registrationsHeading(places));
  if (accepted.length === 0) lines.push(p.noRegistered);
  accepted.forEach((n, i) => lines.push(`${i + 1}. ${n}`));
  if (waitlist.length > 0) {
    lines.push('', p.waitlist(waitlist.length));
    waitlist.forEach((n, i) => lines.push(`${i + 1}. ${n}`));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Matchs (VS)
// ---------------------------------------------------------------------------------------------

/** Nom d'un tour d'élimination : finale, demi-finales, quarts, sinon « Tour N ». */
export function bracketRoundName(
  round: number,
  totalRounds: number,
  locale: Locale = 'fr',
): string {
  const p = PHRASES[locale];
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return p.final;
  if (fromEnd === 1) return p.semiFinals;
  if (fromEnd === 2) return p.quarterFinals;
  return p.round(round);
}

function bracketLine(m: ResolvedMatch, names: Names, p: Phrases): string {
  if (m.aBye || m.bBye) {
    const player = m.aBye ? m.b : m.a;
    return p.bye(nameOf(names, player, p));
  }
  return `${nameOf(names, m.a, p)} vs ${nameOf(names, m.b, p)}`;
}

/** Les matchs d'un tour d'élimination directe, sous la forme « A vs B ». */
export function formatBracketRound(
  bracket: ResolvedBracket,
  round: number,
  names: Names,
  title?: string,
  locale: Locale = 'fr',
): string {
  const p = PHRASES[locale];
  const matches = bracket.rounds[round - 1];
  if (!matches) throw new RangeError(`Tour inconnu : ${round}.`);
  const lines = heading(title, bracketRoundName(round, bracket.rounds.length, locale));
  matches.forEach((m) => lines.push(bracketLine(m, names, p)));
  return lines.join('\n');
}

/** Les matchs d'une journée de ligue, avec le joueur qui se repose. */
export function formatLeagueRound(
  league: League,
  round: number,
  names: Names,
  title?: string,
  locale: Locale = 'fr',
): string {
  const p = PHRASES[locale];
  const matches = league.rounds[round - 1];
  if (!matches) throw new RangeError(`Journée inconnue : ${round}.`);
  const lines = heading(title, p.matchday(round, league.rounds.length));
  matches.forEach((m) => lines.push(`${nameOf(names, m.a, p)} vs ${nameOf(names, m.b, p)}`));
  const rest = league.rests[round - 1];
  if (rest) lines.push(p.rest(nameOf(names, rest, p)));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Résultats
// ---------------------------------------------------------------------------------------------

function scoreLine(a: string, b: string, score: Score, p: Phrases): string {
  if (score.a === score.b) return `${a} ${score.a}-${score.b} ${b} (${p.drawn})`;
  const aWins = score.a > score.b;
  return `${a} ${score.a}-${score.b} ${b} (${p.wins(aWins ? a : b)})`;
}

/** Élimination directe : on ne note pas de score, seulement qui a gagné. */
function winnerLine(a: string, b: string, score: Score, p: Phrases): string {
  return score.a > score.b ? p.beats(a, b) : p.beats(b, a);
}

/** Résultats saisis pour un tour d'élimination directe. Rien si aucun match n'est terminé. */
export function formatBracketResults(
  bracket: ResolvedBracket,
  round: number,
  names: Names,
  title?: string,
  locale: Locale = 'fr',
): string {
  const p = PHRASES[locale];
  const matches = bracket.rounds[round - 1];
  if (!matches) throw new RangeError(`Tour inconnu : ${round}.`);
  const lines = heading(
    title,
    p.resultsRound(bracketRoundName(round, bracket.rounds.length, locale)),
  );
  const done = matches.filter((m) => m.status === 'done' && m.score !== null);
  if (done.length === 0) lines.push(p.noResults);
  for (const m of done) {
    lines.push(winnerLine(nameOf(names, m.a, p), nameOf(names, m.b, p), m.score as Score, p));
  }
  if (round === bracket.rounds.length && bracket.champion !== null) {
    lines.push('', p.champion(nameOf(names, bracket.champion, p)));
  }
  return lines.join('\n');
}

/** Résultats saisis pour une journée de ligue. */
export function formatLeagueResults(
  league: League,
  results: Readonly<Record<string, Score>>,
  round: number,
  names: Names,
  title?: string,
  locale: Locale = 'fr',
): string {
  const p = PHRASES[locale];
  const matches = league.rounds[round - 1];
  if (!matches) throw new RangeError(`Journée inconnue : ${round}.`);
  const lines = heading(title, p.resultsMatchday(round, league.rounds.length));
  const played = matches.filter((m) => results[m.id] !== undefined);
  if (played.length === 0) lines.push(p.noResults);
  for (const m of played) {
    lines.push(scoreLine(nameOf(names, m.a, p), nameOf(names, m.b, p), results[m.id] as Score, p));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------------------------------

/** Classement de la ligue : rang, pseudo, points, bilan victoires-défaites. */
export function formatStandings(
  standings: Standings,
  names: Names,
  title?: string,
  locale: Locale = 'fr',
): string {
  const p = PHRASES[locale];
  const state = standings.complete
    ? p.standingsFinal
    : p.standingsProgress(standings.played, standings.total);
  const lines = heading(title, p.standings(state));
  for (const r of standings.rows) {
    const diff = r.scoreDiff > 0 ? `+${r.scoreDiff}` : `${r.scoreDiff}`;
    lines.push(
      p.standingsRow(
        r.rank,
        nameOf(names, r.playerId, p),
        r.points,
        r.wins,
        r.losses,
        diff,
        r.draws,
      ),
    );
  }
  return lines.join('\n');
}
