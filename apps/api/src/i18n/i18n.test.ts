import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import { LOCALES, pickLocale, translateMessage } from './translate';

/** Remplace les valeurs variables par `{}` pour comparer un texte du code et une ligne du catalogue. */
const normalize = (text: string) => text.replace(/\$\{[^}]+\}|\{\w+\}/g, '{}');
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('catalogue des messages', () => {
  it('chaque message a ses trois langues, sans champ vide ni doublon', () => {
    const empty = CATALOG.filter(
      (e) => e.length !== LOCALES.length || e.some((t) => t.trim() === ''),
    );
    expect(empty).toEqual([]);
    const frenchs = CATALOG.map((e) => normalize(e[0]));
    expect(frenchs.filter((fr, i) => frenchs.indexOf(fr) !== i)).toEqual([]);
  });

  it('les trois langues gardent les mêmes {valeurs}', () => {
    const different = CATALOG.filter((e) => {
      const reference = placeholders(e[0]).join();
      return e.some((text) => placeholders(text).join() !== reference);
    }).map((e) => e[0]);
    expect(different).toEqual([]);
  });

  it('les textes anglais et espagnols ne sont pas des copies du français', () => {
    const copied = CATALOG.filter(([fr, en, es]) => fr.length > 20 && (fr === en || fr === es)).map(
      (e) => e[0],
    );
    expect(copied).toEqual([]);
  });
});

/**
 * Garde-fou : le code de l'API et du moteur est lu, et chaque message qu'il peut renvoyer à une
 * personne doit être dans le catalogue. Un message ajouté sans traduction fait échouer la CI ; une
 * ligne du catalogue qui n'existe plus dans le code aussi (pas de texte mort).
 */
describe('couverture du code', () => {
  const root = resolve(process.cwd(), '..', '..');
  const LIT = "(?:'((?:[^'\\\\]|\\\\.)*)'|`((?:[^`\\\\]|\\\\.)*)`)";
  const patterns = [
    new RegExp(`(?:Exception|EngineError)\\(\\s*${LIT}`, 'g'),
    new RegExp(`message:\\s*${LIT}`, 'g'),
    new RegExp(`\\.(?:min|max|regex|refine)\\([^;]*?,\\s*${LIT}\\s*\\)`, 'g'),
    new RegExp(`assertOpen\\([^,)]+,\\s*${LIT}`, 'g'),
    new RegExp(`^(?:export )?const [A-Z][A-Z_]{3,} = ${LIT}`, 'gm'),
  ];
  /** Messages de démarrage et de développement : jamais vus par un utilisateur. */
  const SKIP = new Set(['config.ts', 'config.token.ts']);

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(path);
      const ok = /\.ts$/.test(entry.name) && !/\.(test|d)\.ts$/.test(entry.name);
      return ok && !SKIP.has(entry.name) && entry.name !== 'test-harness.ts' ? [path] : [];
    });
  }

  const found = new Set<string>();
  for (const dir of ['apps/api/src', 'packages/engine/src']) {
    for (const file of sources(join(root, dir))) {
      // Le moteur lève aussi des `RangeError` pour le développeur (tour inconnu) : pas dans le motif.
      const text = readFileSync(file, 'utf8');
      for (const re of patterns) {
        re.lastIndex = 0;
        for (let m = re.exec(text); m; m = re.exec(text)) {
          const literal = (m[1] ?? m[2] ?? '').replace(/\\'/g, "'");
          if (/\s/.test(literal) && /[a-zà-ÿ]/.test(literal) && literal.length > 8) {
            found.add(normalize(literal));
          }
        }
      }
    }
  }
  const catalogued = new Set(CATALOG.map((e) => normalize(e[0])));

  it('trouve bien des messages (le test ne passe pas à vide)', () => {
    expect(found.size).toBeGreaterThan(80);
  });

  it('tout message du code est traduit', () => {
    expect([...found].filter((m) => !catalogued.has(m)).sort()).toEqual([]);
  });

  it('aucune ligne du catalogue ne reste sans message dans le code', () => {
    expect([...catalogued].filter((m) => !found.has(m)).sort()).toEqual([]);
  });
});

describe('traduction d’un message', () => {
  it('rend le même message dans chaque langue', () => {
    expect(translateMessage('Tournoi introuvable', 'fr')).toBe('Tournoi introuvable');
    expect(translateMessage('Tournoi introuvable', 'en')).toBe('Tournament not found');
    expect(translateMessage('Tournoi introuvable', 'es')).toBe('Torneo no encontrado');
  });

  it('reprend les valeurs variables dans la phrase traduite', () => {
    expect(translateMessage('Une ligue accepte 32 joueurs au plus', 'en')).toBe(
      'A league accepts 32 players at most',
    );
    expect(
      translateMessage(
        'Impossible : 5 joueurs sont déjà acceptés. Retirez-en avant de réduire les places.',
        'es',
      ),
    ).toBe('Imposible: ya hay 5 jugadores aceptados. Retira alguno antes de reducir las plazas.');
    expect(translateMessage('Résultat pour un match inconnu : R1M4.', 'en')).toBe(
      'Result for an unknown match: R1M4.',
    );
    expect(translateMessage("R1M2 est un bye : aucun score n'est possible.", 'es')).toBe(
      'R1M2 es un pase directo: no es posible ningún marcador.',
    );
  });

  it('laisse intact un message qu’il ne connaît pas', () => {
    expect(translateMessage('Cannot GET /nulle-part', 'es')).toBe('Cannot GET /nulle-part');
    expect(translateMessage('', 'en')).toBe('');
  });

  it('ramène le texte anglais de la limite de débit à une phrase de la langue', () => {
    expect(translateMessage('ThrottlerException: Too Many Requests', 'fr')).toBe(
      'Trop de tentatives. Réessaie dans quelques minutes.',
    );
    expect(translateMessage('ThrottlerException: Too Many Requests', 'es')).toBe(
      'Demasiados intentos. Vuelve a intentarlo en unos minutos.',
    );
  });
});

describe('langue demandée', () => {
  it.each([
    [undefined, 'fr'],
    ['', 'fr'],
    ['en', 'en'],
    ['es-MX,es;q=0.9,en;q=0.8', 'es'],
    ['de,en;q=0.5', 'en'],
    ['fr-CH, fr;q=0.9, en;q=0.8', 'fr'],
    ['en;q=0.3, es;q=0.9', 'es'],
    ['ja,ar;q=0.8', 'fr'],
    ['en;q=0', 'fr'],
    ['*', 'fr'],
  ])('%s -> %s', (header, expected) => {
    expect(pickLocale(header)).toBe(expected);
  });
});
