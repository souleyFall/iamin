import { describe, expect, it } from 'vitest';
import { EngineError } from './bracket';
import { buildLeague, computeStandings } from './league';

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const pairKey = (a: string, b: string) => [a, b].sort().join('|');

describe('buildLeague', () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 9, 12])(
    'chaque joueur rencontre chaque adversaire une fois (%i joueurs)',
    (n) => {
      const league = buildLeague(players(n), 's');
      const matches = league.rounds.flat();
      expect(matches).toHaveLength((n * (n - 1)) / 2);

      const pairs = matches.map((m) => pairKey(m.a, m.b));
      expect(new Set(pairs).size).toBe(pairs.length);

      // Personne ne joue deux fois dans la même journée.
      for (const round of league.rounds) {
        const seen = round.flatMap((m) => [m.a, m.b]);
        expect(new Set(seen).size).toBe(seen.length);
      }
    },
  );

  it('fait tourner le repos quand le nombre de joueurs est impair', () => {
    const league = buildLeague(players(5), 's');
    expect(league.rounds).toHaveLength(5);
    expect(league.rests.every((r) => r !== null)).toBe(true);
    expect([...league.rests].sort()).toEqual([...players(5)].sort());
    for (const [r, round] of league.rounds.entries()) {
      expect(round).toHaveLength(2);
      const playing = round.flatMap((m) => [m.a, m.b]);
      expect(playing).not.toContain(league.rests[r]);
    }
  });

  it('n’a aucun repos avec un nombre pair de joueurs', () => {
    expect(buildLeague(players(6), 's').rests.every((r) => r === null)).toBe(true);
  });

  it('double le calendrier en aller-retour avec a et b inversés', () => {
    const league = buildLeague(players(4), 's', { legs: 2 });
    expect(league.rounds).toHaveLength(6);
    const first = league.rounds.slice(0, 3).flat();
    const second = league.rounds.slice(3).flat();
    for (const [i, m] of first.entries()) {
      expect(second[i]).toMatchObject({ a: m.b, b: m.a });
    }
    expect(new Set(league.rounds.flat().map((m) => m.id)).size).toBe(12);
  });

  it('est identique pour la même graine, quel que soit l’ordre des inscrits', () => {
    const a = buildLeague(players(7), 'tournoi-42');
    const b = buildLeague([...players(7)].reverse(), 'tournoi-42');
    expect(b).toEqual(a);
  });

  it('refuse les entrées invalides', () => {
    expect(() => buildLeague(['a'], 's')).toThrow(EngineError);
    expect(() => buildLeague(['a', 'a'], 's')).toThrow(EngineError);
    expect(() => buildLeague(['a', 'b'], ' ')).toThrow(EngineError);
  });
});

describe('computeStandings', () => {
  it('démarre à zéro, dans l’ordre du tirage', () => {
    const league = buildLeague(players(4), 's');
    const s = computeStandings(league, {});
    expect(s.rows.map((r) => r.playerId)).toEqual(league.draw);
    expect(s.rows.every((r) => r.points === 0 && r.played === 0)).toBe(true);
    expect(s).toMatchObject({ played: 0, total: 6, complete: false });
  });

  it('compte points, victoires, défaites et différence de score', () => {
    const league = buildLeague(players(3), 's');
    const [m1] = league.rounds[0] ?? [];
    if (!m1) throw new Error('match attendu');
    const s = computeStandings(league, { [m1.id]: { a: 2, b: 1 } });
    const winner = s.rows.find((r) => r.playerId === m1.a);
    const loser = s.rows.find((r) => r.playerId === m1.b);
    expect(winner).toMatchObject({ points: 3, wins: 1, scoreDiff: 1, rank: 1 });
    expect(loser).toMatchObject({ points: 0, losses: 1, scoreDiff: -1 });
  });

  it('respecte les points configurés', () => {
    const league = buildLeague(players(2), 's');
    const [m] = league.rounds[0] ?? [];
    if (!m) throw new Error('match attendu');
    const s = computeStandings(
      league,
      { [m.id]: { a: 0, b: 2 } },
      { pointsForWin: 2, pointsForLoss: 1 },
    );
    expect(s.rows.map((r) => r.points)).toEqual([2, 1]);
    expect(s.complete).toBe(true);
  });

  it('départage par confrontation directe avant la différence de score', () => {
    // A bat B, B bat C, C bat A : tous à 3 points. On force ensuite des écarts différents.
    const league = buildLeague(['A', 'B', 'C', 'D'], 's');
    const find = (x: string, y: string) => {
      const m = league.rounds.flat().find((k) => pairKey(k.a, k.b) === pairKey(x, y));
      if (!m) throw new Error('match introuvable');
      return m;
    };
    const set = (winner: string, loser: string, ws: number, ls: number) => {
      const m = find(winner, loser);
      return { [m.id]: m.a === winner ? { a: ws, b: ls } : { a: ls, b: ws } };
    };
    const results = {
      ...set('A', 'B', 2, 1),
      ...set('B', 'C', 2, 1),
      ...set('C', 'A', 2, 1),
      // D perd contre tout le monde.
      ...set('A', 'D', 2, 0),
      ...set('B', 'D', 2, 0),
      ...set('C', 'D', 2, 0),
    };
    const s = computeStandings(league, results);
    expect(s.rows.slice(0, 3).every((r) => r.points === 6)).toBe(true);
    expect(s.rows[3]?.playerId).toBe('D');
    expect(s.complete).toBe(true);
  });

  it('une confrontation directe l’emporte sur une meilleure différence de score', () => {
    const league = buildLeague(['A', 'B', 'C', 'D'], 's');
    const set = (winner: string, loser: string, ws: number, ls: number) => {
      const m = league.rounds.flat().find((k) => pairKey(k.a, k.b) === pairKey(winner, loser));
      if (!m) throw new Error('match introuvable');
      return { [m.id]: m.a === winner ? { a: ws, b: ls } : { a: ls, b: ws } };
    };
    // A et B finissent à 6 points. B a battu A, mais A a la meilleure différence de score.
    const results = {
      ...set('B', 'A', 2, 1),
      ...set('A', 'C', 2, 0),
      ...set('A', 'D', 2, 0),
      ...set('B', 'C', 2, 1),
      ...set('D', 'B', 2, 0),
      ...set('C', 'D', 2, 1),
    };
    const s = computeStandings(league, results);
    const row = (id: string) => s.rows.find((r) => r.playerId === id);
    expect(row('A')).toMatchObject({ points: 6, scoreDiff: 3 });
    expect(row('B')).toMatchObject({ points: 6, scoreDiff: 0 });
    expect(s.rows.map((r) => r.playerId).slice(0, 2)).toEqual(['B', 'A']);
  });

  it('tranche les égalités parfaites par l’ordre du tirage, avec des rangs uniques', () => {
    const league = buildLeague(players(4), 's');
    const s = computeStandings(league, {});
    expect(s.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('refuse un match inconnu ou un score invalide', () => {
    const league = buildLeague(players(3), 's');
    expect(() => computeStandings(league, { R9M9: { a: 1, b: 0 } })).toThrow(/inconnu/);
    expect(() => computeStandings(league, { R1M1: { a: 1, b: 1 } })).toThrow(/égalité/);
  });
});
