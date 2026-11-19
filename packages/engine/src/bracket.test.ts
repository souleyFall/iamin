import { describe, expect, it } from 'vitest';
import { buildBracket, EngineError, resolveBracket, seedOrder } from './bracket';
import { createRandom, shuffle } from './prng';

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('prng', () => {
  it('rejoue la même suite avec la même graine', () => {
    const a = createRandom('graine');
    const b = createRandom('graine');
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });

  it('donne une suite différente avec une autre graine', () => {
    expect(createRandom('a')()).not.toBe(createRandom('b')());
  });

  it('reste dans [0, 1)', () => {
    const r = createRandom('x');
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('mélange sans perdre ni dupliquer et sans toucher la liste d’origine', () => {
    const source = players(20);
    const copy = [...source];
    const out = shuffle(source, createRandom('m'));
    expect(source).toEqual(copy);
    expect([...out].sort()).toEqual([...source].sort());
  });
});

describe('seedOrder', () => {
  it('suit l’ordre standard', () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('refuse une taille qui n’est pas une puissance de deux', () => {
    expect(() => seedOrder(6)).toThrow(EngineError);
    expect(() => seedOrder(1)).toThrow(EngineError);
  });
});

describe('buildBracket', () => {
  it('est identique pour la même graine, quel que soit l’ordre des inscrits', () => {
    const a = buildBracket(players(11), 'tournoi-42');
    const b = buildBracket([...players(11)].reverse(), 'tournoi-42');
    expect(b).toEqual(a);
  });

  it('change avec la graine', () => {
    const a = buildBracket(players(16), 'un');
    const b = buildBracket(players(16), 'deux');
    expect(a.draw).not.toEqual(b.draw);
  });

  it.each([2, 3, 4, 5, 7, 8, 9, 13, 16, 17, 31, 32, 33])('est cohérent pour %i joueurs', (n) => {
    const bracket = buildBracket(players(n), 's');
    const matches = bracket.rounds.flat();

    expect(bracket.byes).toBe(bracket.size - n);
    expect(matches).toHaveLength(bracket.size - 1);
    expect(bracket.rounds.at(-1)).toHaveLength(1);

    const first = bracket.rounds[0] ?? [];
    const placed = first
      .flatMap((m) => [m.a, m.b])
      .flatMap((s) => (s.kind === 'player' ? [s.playerId] : []));
    expect([...placed].sort()).toEqual([...players(n)].sort());

    // Jamais deux byes dans le même match.
    for (const m of first) expect(m.a.kind === 'bye' && m.b.kind === 'bye').toBe(false);
    // Jamais de bye après le premier tour.
    for (const m of bracket.rounds.slice(1).flat()) {
      expect(m.a.kind).toBe('winner-of');
      expect(m.b.kind).toBe('winner-of');
    }
  });

  it('donne les byes aux têtes de série 1 à N', () => {
    const bracket = buildBracket(players(5), 's'); // taille 8, 3 byes
    const withBye = (bracket.rounds[0] ?? [])
      .filter((m) => m.a.kind === 'bye' || m.b.kind === 'bye')
      .map((m) =>
        m.a.kind === 'player' ? m.a.playerId : m.b.kind === 'player' ? m.b.playerId : '',
      );
    expect([...withBye].sort()).toEqual([...bracket.draw.slice(0, 3)].sort());
  });

  it('refuse les entrées invalides', () => {
    expect(() => buildBracket(['a'], 's')).toThrow(EngineError);
    expect(() => buildBracket(['a', 'a'], 's')).toThrow(EngineError);
    expect(() => buildBracket(['a', 'b'], '  ')).toThrow(EngineError);
  });
});

describe('resolveBracket', () => {
  it('fait passer les byes et attend les autres matchs', () => {
    const bracket = buildBracket(players(3), 's'); // taille 4, 1 bye
    const resolved = resolveBracket(bracket, {});
    const statuses = (resolved.rounds[0] ?? []).map((m) => m.status).sort();
    expect(statuses).toEqual(['bye', 'ready']);
    expect(resolved.rounds[1]?.[0]?.status).toBe('waiting');
    expect(resolved.champion).toBeNull();
  });

  it('fait avancer les vainqueurs jusqu’au champion', () => {
    const bracket = buildBracket(players(4), 's');
    const [m1, m2] = bracket.rounds[0] ?? [];
    if (!m1 || !m2) throw new Error('tableau inattendu');

    let resolved = resolveBracket(bracket, { [m1.id]: { a: 2, b: 0 }, [m2.id]: { a: 0, b: 2 } });
    const final = resolved.rounds[1]?.[0];
    expect(final?.status).toBe('ready');
    expect(final?.a).toBe(resolved.rounds[0]?.[0]?.winner);
    expect(final?.b).toBe(resolved.rounds[0]?.[1]?.winner);

    resolved = resolveBracket(bracket, {
      [m1.id]: { a: 2, b: 0 },
      [m2.id]: { a: 0, b: 2 },
      R2M1: { a: 1, b: 2 },
    });
    expect(resolved.champion).toBe(resolved.rounds[1]?.[0]?.b);
  });

  it('ne modifie ni le tableau ni les résultats', () => {
    const bracket = buildBracket(players(4), 's');
    const snapshot = JSON.stringify(bracket);
    const results = { R1M1: { a: 2, b: 1 } };
    const resultsSnapshot = JSON.stringify(results);
    resolveBracket(bracket, results);
    expect(JSON.stringify(bracket)).toBe(snapshot);
    expect(JSON.stringify(results)).toBe(resultsSnapshot);
  });

  it('refuse les scores invalides', () => {
    const bracket = buildBracket(players(4), 's');
    expect(() => resolveBracket(bracket, { R1M1: { a: 1, b: 1 } })).toThrow(/égalité/);
    expect(() => resolveBracket(bracket, { R1M1: { a: -1, b: 2 } })).toThrow(EngineError);
    expect(() => resolveBracket(bracket, { R1M1: { a: 1.5, b: 2 } })).toThrow(EngineError);
  });

  it('refuse un score pour un match inconnu, un bye ou un match pas prêt', () => {
    const bracket = buildBracket(players(3), 's');
    expect(() => resolveBracket(bracket, { R9M9: { a: 1, b: 0 } })).toThrow(/inconnu/);
    expect(() => resolveBracket(bracket, { R2M1: { a: 1, b: 0 } })).toThrow(/pas encore/);
    const byeMatch = (bracket.rounds[0] ?? []).find(
      (m) => m.a.kind === 'bye' || m.b.kind === 'bye',
    );
    if (!byeMatch) throw new Error('bye attendu');
    expect(() => resolveBracket(bracket, { [byeMatch.id]: { a: 1, b: 0 } })).toThrow(/bye/);
  });
});
