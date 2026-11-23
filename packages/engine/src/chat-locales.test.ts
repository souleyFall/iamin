import { describe, expect, it } from 'vitest';
import { buildBracket, resolveBracket } from './bracket';
import {
  bracketRoundName,
  formatBracketResults,
  formatBracketRound,
  formatLeagueResults,
  formatLeagueRound,
  formatRegistrations,
  formatStandings,
  LOCALES,
  type Locale,
} from './chat';
import { buildLeague, computeStandings } from './league';

/** Les textes du chat en anglais et en espagnol : les joueurs les lisent dans la langue du tournoi. */

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const names = Object.fromEntries(ids(8).map((id, i) => [id, `Joueur${i + 1}`]));

describe('inscrits', () => {
  it.each<[Locale, string]>([
    ['fr', "Coupe\nInscrits : 2/8 places\n1. Ali\n2. Bob\n\nListe d'attente : 1\n1. Cléo"],
    ['en', 'Coupe\nRegistered: 2/8 spots\n1. Ali\n2. Bob\n\nWaiting list: 1\n1. Cléo'],
    ['es', 'Coupe\nInscritos: 2/8 plazas\n1. Ali\n2. Bob\n\nLista de espera: 1\n1. Cléo'],
  ])('%s', (locale, expected) => {
    expect(
      formatRegistrations({
        title: 'Coupe',
        accepted: ['Ali', 'Bob'],
        waitlist: ['Cléo'],
        capacity: 8,
        locale,
      }),
    ).toBe(expected);
  });

  it('accorde le pluriel et dit « personne » dans chaque langue', () => {
    expect(formatRegistrations({ accepted: [], locale: 'en' })).toBe(
      'Registered: 0 registered\nNo one registered yet.',
    );
    expect(formatRegistrations({ accepted: ['a', 'b'], locale: 'es' })).toContain('2 inscritos');
    expect(formatRegistrations({ accepted: [], locale: 'es' })).toContain('Nadie inscrito');
  });
});

describe('noms de tour', () => {
  it.each<[Locale, string, string, string, string]>([
    ['fr', 'Finale', 'Demi-finales', 'Quarts de finale', 'Tour 1'],
    ['en', 'Final', 'Semi-finals', 'Quarter-finals', 'Round 1'],
    ['es', 'Final', 'Semifinales', 'Cuartos de final', 'Ronda 1'],
  ])('%s', (locale, final, semi, quarter, other) => {
    expect(bracketRoundName(3, 3, locale)).toBe(final);
    expect(bracketRoundName(2, 3, locale)).toBe(semi);
    expect(bracketRoundName(1, 3, locale)).toBe(quarter);
    expect(bracketRoundName(1, 4, locale)).toBe(other);
  });
});

describe('élimination directe', () => {
  const bracket = resolveBracket(buildBracket(ids(3), 's'), {});

  it('annonce les matchs et le bye dans la langue demandée', () => {
    const en = formatBracketRound(bracket, 1, names, 'Cup', 'en');
    const es = formatBracketRound(bracket, 1, names, 'Cup', 'es');
    expect(en.split('\n')[1]).toBe('Semi-finals');
    expect(en).toContain(': bye');
    expect(es.split('\n')[1]).toBe('Semifinales');
    expect(es).toContain('pase directo (bye)');
  });

  it('annonce les résultats et le vainqueur', () => {
    const last = bracket.rounds.length;
    const en = formatBracketResults(bracket, last, names, undefined, 'en');
    const es = formatBracketResults(bracket, last, names, undefined, 'es');
    expect(en.split('\n')[0]).toBe('Results: Final');
    expect(es.split('\n')[0]).toBe('Resultados: Final');
    expect(en).toContain('No results yet.');
    expect(es).toContain('Sin resultados por ahora.');
  });
});

describe('ligue', () => {
  const league = buildLeague(ids(4), 's');
  const first = league.rounds[0]?.[0];
  const results = first ? { [first.id]: { a: 2, b: 0 } } : {};

  it('annonce la journée, le repos et les résultats', () => {
    expect(formatLeagueRound(league, 1, names, undefined, 'en').split('\n')[0]).toBe(
      `Matchday 1/${league.rounds.length}`,
    );
    expect(formatLeagueRound(league, 1, names, undefined, 'es').split('\n')[0]).toBe(
      `Jornada 1/${league.rounds.length}`,
    );
    const odd = buildLeague(ids(3), 's');
    expect(formatLeagueRound(odd, 1, names, undefined, 'en')).toContain('Rest: ');
    expect(formatLeagueRound(odd, 1, names, undefined, 'es')).toContain('Descansa: ');

    const en = formatLeagueResults(league, results, 1, names, undefined, 'en');
    expect(en).toContain('Results: matchday 1/');
    expect(en).toMatch(/\(Joueur\d wins\)/);
    expect(formatLeagueResults(league, results, 1, names, undefined, 'es')).toMatch(
      /\(gana Joueur\d\)/,
    );
  });

  it('écrit le classement avec les initiales de chaque langue', () => {
    const standings = computeStandings(league, results);
    expect(formatStandings(standings, names, 'Cup', 'en')).toMatch(/\d+W \d+L/);
    expect(formatStandings(standings, names, 'Cup', 'es')).toMatch(/\d+G \d+P/);
    expect(formatStandings(standings, names, 'Cup', 'fr')).toMatch(/\d+V \d+D/);
    expect(formatStandings(standings, names, 'Cup', 'en')).toContain('Standings (1/');
    expect(formatStandings(standings, names, 'Cup', 'es')).toContain('Clasificación (1/');
  });
});

describe('toutes les langues', () => {
  it('un pseudo ne peut pas ajouter de fausses lignes, quelle que soit la langue', () => {
    for (const locale of LOCALES) {
      const text = formatRegistrations({ accepted: ['Ali\n2. Faux'], locale });
      expect(text.split('\n')).toHaveLength(2);
    }
  });

  it('le français reste la langue par défaut', () => {
    expect(formatRegistrations({ accepted: ['a'] })).toBe(
      formatRegistrations({ accepted: ['a'], locale: 'fr' }),
    );
  });
});
