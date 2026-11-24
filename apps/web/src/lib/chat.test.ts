import { buildBracket, buildLeague, computeStandings, resolveBracket } from '@iamin/engine';
import { describe, expect, it } from 'vitest';
import type { BracketView, LeagueView, Registration, Tournament } from '../api/types';
import { chatChoices, namesOf } from './chat';
import { translate, type Params } from './i18n';
import type { MessageKey } from './i18n/messages';

/** Les libellés du menu en français : la langue de référence des assertions de ce fichier. */
const tr = (key: MessageKey, params?: Params) => translate('fr', key, params);

const reg = (
  id: string,
  platoName: string,
  status: Registration['status'] = 'ACCEPTED',
): Registration => ({
  id,
  platoName,
  status,
  presence: 'PRESENT',
  createdAt: '2026-11-22T10:00:00Z',
});

const tournament = (format: Tournament['format'], registrations: Registration[]): Tournament => ({
  id: 't1',
  name: 'Échecs #12',
  format,
  capacity: 4,
  status: 'STARTED',
  publicSlug: 's'.repeat(22),
  forfeitScore: 1,
  allowDraws: false,
  language: 'fr',
  createdAt: '2026-11-22T10:00:00Z',
  drawnAt: '2026-11-22T11:00:00Z',
  drawSeed: 'seed',
  holder: null,
  handoverTo: null,
  registrations,
});

const players = [
  reg('p1', 'Karim_77'),
  reg('p2', 'Sana.fx'),
  reg('p3', 'Lina_9'),
  reg('p4', 'Yanis'),
];
const view = (
  t: Tournament,
): Pick<
  BracketView,
  'format' | 'status' | 'seed' | 'drawnAt' | 'forfeitScore' | 'allowDraws' | 'versions' | 'forfeits'
> & {
  players: BracketView['players'];
  initialPlayers: string[];
} => ({
  format: t.format,
  status: t.status,
  seed: 'seed',
  drawnAt: t.drawnAt,
  forfeitScore: 1,
  allowDraws: false,
  versions: {},
  forfeits: {},
  initialPlayers: players.map((p) => p.id),
  players: players.map((p) => ({ id: p.id, platoName: p.platoName, status: p.status })),
});

describe('chatChoices', () => {
  it('ne propose que la liste des inscrits avant le tirage', () => {
    const t = tournament('ELIMINATION', [...players, reg('p5', 'Zack_42', 'WAITLIST')]);
    const choices = chatChoices(t, undefined, tr);
    expect(choices.map((c) => c.key)).toEqual(['registrations']);
    expect(choices[0]?.text).toContain('Inscrits : 4/4 places');
    expect(choices[0]?.text).toContain("Liste d'attente : 1");
    expect(choices[0]?.text).toContain('1. Zack_42');
  });

  it('propose les VS et les résultats de chaque tour d’une élimination', () => {
    const t = tournament('ELIMINATION', players);
    const bracket = buildBracket(
      players.map((p) => p.id),
      'seed',
    );
    const resolved = resolveBracket(bracket, {});
    const draw: BracketView = {
      ...view(t),
      bracket: { size: bracket.size, byes: bracket.byes, rounds: resolved.rounds },
      champion: null,
    };
    const choices = chatChoices(t, draw, tr);
    expect(choices.map((c) => c.label)).toEqual([
      'Liste des inscrits',
      'Demi-finales : VS',
      'Demi-finales : résultats',
      'Finale : VS',
      'Finale : résultats',
    ]);
    const vs = choices.find((c) => c.key === 'vs-1')?.text ?? '';
    expect(vs).toContain('Échecs #12');
    expect(vs).toMatch(/\w+ vs \w+/);
    expect(vs).not.toContain('p1');
  });

  it('propose les journées, les résultats et le classement d’une ligue', () => {
    const t = tournament('LEAGUE', players);
    const ids = players.map((p) => p.id);
    const league = buildLeague(ids, 'seed', { legs: 1 });
    const scores = { [league.rounds[0]?.[0]?.id ?? '']: { a: 2, b: 1 } };
    const draw: LeagueView = {
      ...view(t),
      schedule: { legs: league.legs, rounds: league.rounds, rests: league.rests },
      scores,
      standings: computeStandings(league, scores),
    };
    const labels = chatChoices(t, draw, tr).map((c) => c.label);
    expect(labels).toContain('Journée 1 : VS');
    expect(labels).toContain('Journée 3 : résultats');
    expect(labels.at(-1)).toBe('Classement');
    const results = chatChoices(t, draw, tr).find((c) => c.key === 'results-1')?.text ?? '';
    expect(results).toContain('2-1');
  });

  it('nettoie un pseudo qui tente d’ajouter de fausses lignes', () => {
    const t = tournament('ELIMINATION', [
      reg('p1', 'Gentil\nFAUX : tu as perdu'),
      players[1] as Registration,
    ]);
    const text = chatChoices(t, undefined, tr)[0]?.text ?? '';
    expect(text).not.toContain('\nFAUX');
    expect(text.split('\n').some((line) => line.startsWith('FAUX'))).toBe(false);
  });
});

describe('namesOf', () => {
  it('garde les joueurs remplacés : d’anciens scores les citent', () => {
    const t = tournament('ELIMINATION', [reg('p1', 'Karim_77', 'REPLACED')]);
    expect(namesOf(undefined, t)).toEqual({ p1: 'Karim_77' });
  });
});
