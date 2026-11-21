import type { ResolvedBracket, ResolvedMatch, Score } from './bracket';
import type { League, Standings } from './league';

/**
 * Générateurs de texte à copier-coller dans le chat Plato.
 *
 * Texte brut uniquement (pas de Markdown, pas d'HTML) : une ligne par information, lisible
 * sur mobile. Les pseudos viennent d'inscriptions publiques : ils sont nettoyés (retours à la
 * ligne et caractères de contrôle supprimés) pour qu'un pseudo ne puisse pas fausser le message
 * copié ni y glisser de fausses lignes.
 */

/** Table identifiant du joueur → pseudo affiché. */
export type Names = Readonly<Record<string, string>>;

/** Nettoie un pseudo pour l'affichage dans une ligne de chat. */
export function cleanName(raw: string): string {
  return raw
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameOf(names: Names, id: string | null): string {
  if (id === null) return 'à déterminer';
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
}

/** Liste des inscrits (et de la liste d'attente) à publier dans le chat. */
export function formatRegistrations(input: RegistrationsInput): string {
  const accepted = input.accepted.map(cleanName);
  const waitlist = (input.waitlist ?? []).map(cleanName);
  const places =
    input.capacity === undefined
      ? `${accepted.length} inscrit${accepted.length > 1 ? 's' : ''}`
      : `${accepted.length}/${input.capacity} places`;

  const lines = heading(input.title, `Inscrits : ${places}`);
  if (accepted.length === 0) lines.push('Aucun inscrit pour le moment.');
  accepted.forEach((n, i) => lines.push(`${i + 1}. ${n}`));
  if (waitlist.length > 0) {
    lines.push('', `Liste d'attente : ${waitlist.length}`);
    waitlist.forEach((n, i) => lines.push(`${i + 1}. ${n}`));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Matchs (VS)
// ---------------------------------------------------------------------------------------------

/** Nom d'un tour d'élimination : finale, demi-finales, quarts, sinon « Tour N ». */
export function bracketRoundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Finale';
  if (fromEnd === 1) return 'Demi-finales';
  if (fromEnd === 2) return 'Quarts de finale';
  return `Tour ${round}`;
}

function bracketLine(m: ResolvedMatch, names: Names): string {
  if (m.aBye || m.bBye) {
    const player = m.aBye ? m.b : m.a;
    return `${nameOf(names, player)} : exempt (bye)`;
  }
  return `${nameOf(names, m.a)} vs ${nameOf(names, m.b)}`;
}

/** Les matchs d'un tour d'élimination directe, sous la forme « A vs B ». */
export function formatBracketRound(
  bracket: ResolvedBracket,
  round: number,
  names: Names,
  title?: string,
): string {
  const matches = bracket.rounds[round - 1];
  if (!matches) throw new RangeError(`Tour inconnu : ${round}.`);
  const lines = heading(title, bracketRoundName(round, bracket.rounds.length));
  matches.forEach((m) => lines.push(bracketLine(m, names)));
  return lines.join('\n');
}

/** Les matchs d'une journée de ligue, avec le joueur qui se repose. */
export function formatLeagueRound(
  league: League,
  round: number,
  names: Names,
  title?: string,
): string {
  const matches = league.rounds[round - 1];
  if (!matches) throw new RangeError(`Journée inconnue : ${round}.`);
  const lines = heading(title, `Journée ${round}/${league.rounds.length}`);
  matches.forEach((m) => lines.push(`${nameOf(names, m.a)} vs ${nameOf(names, m.b)}`));
  const rest = league.rests[round - 1];
  if (rest) lines.push(`Repos : ${nameOf(names, rest)}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Résultats
// ---------------------------------------------------------------------------------------------

function scoreLine(a: string, b: string, score: Score): string {
  const aWins = score.a > score.b;
  return `${a} ${score.a}-${score.b} ${b} (victoire de ${aWins ? a : b})`;
}

/** Résultats saisis pour un tour d'élimination directe. Rien si aucun match n'est terminé. */
export function formatBracketResults(
  bracket: ResolvedBracket,
  round: number,
  names: Names,
  title?: string,
): string {
  const matches = bracket.rounds[round - 1];
  if (!matches) throw new RangeError(`Tour inconnu : ${round}.`);
  const lines = heading(title, `Résultats : ${bracketRoundName(round, bracket.rounds.length)}`);
  const done = matches.filter((m) => m.status === 'done' && m.score !== null);
  if (done.length === 0) lines.push('Aucun résultat pour le moment.');
  for (const m of done) {
    lines.push(scoreLine(nameOf(names, m.a), nameOf(names, m.b), m.score as Score));
  }
  if (round === bracket.rounds.length && bracket.champion !== null) {
    lines.push('', `Vainqueur du tournoi : ${nameOf(names, bracket.champion)}`);
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
): string {
  const matches = league.rounds[round - 1];
  if (!matches) throw new RangeError(`Journée inconnue : ${round}.`);
  const lines = heading(title, `Résultats : journée ${round}/${league.rounds.length}`);
  const played = matches.filter((m) => results[m.id] !== undefined);
  if (played.length === 0) lines.push('Aucun résultat pour le moment.');
  for (const m of played) {
    lines.push(scoreLine(nameOf(names, m.a), nameOf(names, m.b), results[m.id] as Score));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------------------------------

/** Classement de la ligue : rang, pseudo, points, bilan victoires-défaites. */
export function formatStandings(standings: Standings, names: Names, title?: string): string {
  const state = standings.complete
    ? 'classement final'
    : `${standings.played}/${standings.total} matchs joués`;
  const lines = heading(title, `Classement (${state})`);
  for (const r of standings.rows) {
    const diff = r.scoreDiff > 0 ? `+${r.scoreDiff}` : `${r.scoreDiff}`;
    lines.push(
      `${r.rank}. ${nameOf(names, r.playerId)} : ${r.points} pts (${r.wins}V ${r.losses}D, ${diff})`,
    );
  }
  return lines.join('\n');
}
