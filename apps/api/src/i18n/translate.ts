import { ALIASES, CATALOG, type Entry } from './catalog';

export const LOCALES = ['fr', 'en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';

const COLUMN: Record<Locale, 0 | 1 | 2> = { fr: 0, en: 1, es: 2 };

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Compiled {
  entry: Entry;
  /** Noms des `{valeurs}` dans l'ordre où elles apparaissent dans le français. */
  names: string[];
  pattern: RegExp;
}

/** Textes sans valeur variable : une simple table. */
const exact = new Map<string, Entry>();
/** Textes avec `{valeur}` : reconnus par une expression régulière construite sur le français. */
const templates: Compiled[] = [];

for (const entry of CATALOG) {
  const fr = entry[0];
  const names = [...fr.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '');
  if (names.length === 0) {
    exact.set(fr, entry);
    continue;
  }
  const source = fr
    .split(/\{\w+\}/)
    .map(escape)
    .join('(.+?)');
  templates.push({ entry, names, pattern: new RegExp(`^${source}$`) });
}

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

/**
 * Langue demandée par `Accept-Language` : la première, par ordre de préférence (`q`), que l'API sait
 * écrire (« es-MX » donne « es »). Sans préférence reconnue, le français.
 */
export function pickLocale(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const wanted = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q=([\d.]+)/.exec(p)?.[1]).find((v) => v !== undefined);
      return {
        base: tag.trim().toLowerCase().split('-')[0] ?? '',
        q: q === undefined ? 1 : Number(q),
        index,
      };
    })
    .filter((w) => w.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { base } of wanted) if (isLocale(base)) return base;
  return DEFAULT_LOCALE;
}

/** Texte renvoyé tel quel s'il n'est pas dans le catalogue (jamais d'erreur à cause d'une traduction). */
export function translateMessage(message: string, locale: Locale): string {
  const source = ALIASES[message] ?? message;
  const hit = exact.get(source);
  if (hit) return hit[COLUMN[locale]];
  for (const { entry, names, pattern } of templates) {
    const match = pattern.exec(source);
    if (!match) continue;
    const values = new Map(names.map((name, i) => [name, match[i + 1] ?? '']));
    return entry[COLUMN[locale]].replace(
      /\{(\w+)\}/g,
      (whole, name: string) => values.get(name) ?? whole,
    );
  }
  return message;
}
