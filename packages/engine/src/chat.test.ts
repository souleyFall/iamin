import { describe, expect, it } from 'vitest';
import { buildBracket, resolveBracket } from './bracket';
import {
  bracketRoundName,
  cleanName,
  formatBracketResults,
  formatBracketRound,
  formatLeagueResults,
  formatLeagueRound,
  formatRegistrations,
  formatStandings,
} from './chat';
import { buildLeague, computeStandings } from './league';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const names = Object.fromEntries(ids(8).map((id, i) => [id, `Joueur${i + 1}`]));

describe('cleanName', () => {
  it('supprime retours à la ligne, tabulations et caractères de contrôle', () => {
    expect(cleanName('Ali\nFAUX : 2-0 Bob')).toBe('Ali FAUX : 2-0 Bob');
    expect(cleanName('  a\t\tb  ')).toBe('a b');
    expect(cleanName('x\u0000y‮z')).toBe('x y z');
  });

  it('garde les accents et les pseudos ordinaires', () => {
    expect(cleanName('Zoé_92')).toBe('Zoé_92');
  });
});

describe('formatRegistrations', () => {
  it('liste les inscrits et la liste d’attente', () => {
    const text = formatRegistrations({
      title: 'Coupe du vendredi',
      accepted: ['Ali', 'Bob'],
      waitlist: ['Cléo'],
      capacity: 8,
    });
    expect(text).toBe(
      [
        'Coupe du vendredi',
        'Inscrits : 2/8 places',
        '1. Ali',
        '2. Bob',
        '',
        "Liste d'attente : 1",
        '1. Cléo',
      ].join('\n'),
    );
  });

  it('gère un tournoi vide et le pluriel', () => {
    expect(formatRegistrations({ accepted: [] })).toBe(
      'Inscrits : 0 inscrit\nAucun inscrit pour le moment.',
    );
    expect(formatRegistrations({ accepted: ['a', 'b'] })).toContain('2 inscrits');
  });

  it('un pseudo ne peut pas ajouter de fausses lignes', () => {
    const text = formatRegistrations({ accepted: ['Ali\n2. Faux'] });
    expect(text.split('\n')).toHaveLength(2);
  });
});

describe('bracketRoundName', () => {
  it('nomme la finale, les demi-finales et les quarts', () => {
    expect(bracketRoundName(3, 3)).toBe('Finale');
    expect(bracketRoundName(2, 3)).toBe('Demi-finales');
    expect(bracketRoundName(1, 3)).toBe('Quarts de finale');
    expect(bracketRoundName(1, 4)).toBe('Tour 1');
  });
});

describe('élimination directe', () => {
  const bracket = buildBracket(ids(5), 's'); // 8 places, 3 byes
  const resolved = resolveBracket(bracket, {});

  it('affiche les VS et les byes du premier tour', () => {
    const text = formatBracketRound(resolved, 1, names, 'Coupe');
    const lines = text.split('\n');
    expect(lines[0]).toBe('Coupe');
    expect(lines[1]).toBe('Quarts de finale');
    expect(lines.filter((l) => l.includes('vs'))).toHaveLength(1);
    expect(lines.filter((l) => l.endsWith('exempt (bye)'))).toHaveLength(3);
  });

  it('affiche « à déterminer » pour les joueurs pas encore connus', () => {
    expect(formatBracketRound(resolved, 2, names)).toContain('à déterminer');
  });

  it('affiche les résultats et le vainqueur après la finale', () => {
    const b = buildBracket(ids(2), 's');
    const done = resolveBracket(b, { R1M1: { a: 2, b: 1 } });
    const text = formatBracketResults(done, 1, names);
    expect(text).toMatch(/Résultats : Finale/);
    // Élimination directe : le vainqueur, jamais un score.
    expect(text).toMatch(/Joueur\d bat Joueur\d/);
    expect(text).not.toMatch(/\d-\d/);
    expect(text).toMatch(/Vainqueur du tournoi : Joueur\d/);
  });

  it('le texte reste honnête quand rien n’est joué', () => {
    expect(formatBracketResults(resolved, 1, names)).toContain('Aucun résultat pour le moment.');
  });

  it('refuse un tour inconnu', () => {
    expect(() => formatBracketRound(resolved, 9, names)).toThrow(RangeError);
    expect(() => formatBracketResults(resolved, 0, names)).toThrow(RangeError);
  });

  it('retombe sur l’identifiant si le pseudo est inconnu', () => {
    expect(formatBracketRound(resolved, 1, {})).toMatch(/p\d/);
  });
});

describe('ligue', () => {
  const league = buildLeague(ids(5), 's');

  it('affiche la journée avec le joueur au repos', () => {
    const text = formatLeagueRound(league, 1, names);
    expect(text).toMatch(/^Journée 1\/5/);
    expect(text).toMatch(/Repos : Joueur\d/);
    expect(text.split('\n').filter((l) => l.includes(' vs '))).toHaveLength(2);
  });

  it('affiche les résultats de la journée', () => {
    const m = league.rounds[0]?.[0];
    if (!m) throw new Error('match attendu');
    const text = formatLeagueResults(league, { [m.id]: { a: 2, b: 0 } }, 1, names);
    expect(text).toMatch(/2-0/);
    expect(text).toMatch(/victoire de/);
    expect(formatLeagueResults(league, {}, 1, names)).toContain('Aucun résultat');
  });

  it('affiche le classement', () => {
    const m = league.rounds[0]?.[0];
    if (!m) throw new Error('match attendu');
    const standings = computeStandings(league, { [m.id]: { a: 2, b: 1 } });
    const text = formatStandings(standings, names, 'Ligue');
    const lines = text.split('\n');
    expect(lines[0]).toBe('Ligue');
    expect(lines[1]).toBe('Classement (1/10 matchs joués)');
    expect(lines[2]).toMatch(/^1\. Joueur\d : 3 pts \(1V 0D, \+1\)$/);
    expect(lines).toHaveLength(2 + 5);
  });

  it('indique le classement final quand tout est joué', () => {
    const two = buildLeague(ids(2), 's');
    const m = two.rounds[0]?.[0];
    if (!m) throw new Error('match attendu');
    const text = formatStandings(computeStandings(two, { [m.id]: { a: 0, b: 2 } }), names);
    expect(text).toContain('classement final');
    expect(text).toContain('-2');
  });

  it('refuse une journée inconnue', () => {
    expect(() => formatLeagueRound(league, 99, names)).toThrow(RangeError);
    expect(() => formatLeagueResults(league, {}, 0, names)).toThrow(RangeError);
  });
});

describe('chat : élimination et nuls', () => {
  it('l’élimination n’affiche que le vainqueur, dans les trois langues', () => {
    const bracket = buildBracket(ids(2), 's');
    const done = resolveBracket(bracket, { R1M1: { a: 1, b: 0 } });
    const fr = formatBracketResults(done, 1, names, undefined, 'fr');
    const en = formatBracketResults(done, 1, names, undefined, 'en');
    const es = formatBracketResults(done, 1, names, undefined, 'es');
    expect(fr).toMatch(/ bat /);
    expect(en).toMatch(/ beat /);
    expect(es).toMatch(/ vence a /);
    for (const text of [fr, en, es]) expect(text).not.toMatch(/\d-\d/);
  });

  it('un nul de ligue s’écrit « match nul », « draw », « empate »', () => {
    const league = buildLeague(ids(3), 's');
    const first = league.rounds[0]?.[0];
    const results = { [first!.id]: { a: 1, b: 1 } };
    expect(formatLeagueResults(league, results, 1, names, undefined, 'fr')).toContain('1-1');
    expect(formatLeagueResults(league, results, 1, names, undefined, 'fr')).toContain('match nul');
    expect(formatLeagueResults(league, results, 1, names, undefined, 'en')).toContain('(draw)');
    expect(formatLeagueResults(league, results, 1, names, undefined, 'es')).toContain('(empate)');
  });

  it('le classement ajoute le nombre de nuls seulement s’il y en a', () => {
    const league = buildLeague(ids(3), 's');
    const first = league.rounds[0]?.[0];
    const none = computeStandings(league, { [first!.id]: { a: 2, b: 0 } });
    expect(formatStandings(none, names)).not.toMatch(/\dN/);
    const withTie = computeStandings(league, { [first!.id]: { a: 1, b: 1 } }, { allowDraws: true });
    expect(formatStandings(withTie, names)).toMatch(/0V 1N 0D/);
    expect(formatStandings(withTie, names, undefined, 'en')).toMatch(/0W 1D 0L/);
    expect(formatStandings(withTie, names, undefined, 'es')).toMatch(/0G 1E 0P/);
  });
});
