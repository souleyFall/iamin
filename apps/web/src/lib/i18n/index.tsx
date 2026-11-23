import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { readPref, writePref } from '../storage';
import { MESSAGES, type MessageKey } from './messages';

/**
 * Langues de l'interface. Une langue en plus = une colonne de plus dans `messages/*.ts` (le test
 * de complétude refuse un texte sans traduction) et une ligne ici. L'arabe, de droite à gauche,
 * demande en plus une mise en page inversée : prévue plus tard, pas encore faite.
 */
export const LOCALES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
] as const;
export type Locale = (typeof LOCALES)[number]['code'];
export const DEFAULT_LOCALE: Locale = 'fr';

/** Position de chaque langue dans les triplets [fr, en, es] des messages. */
const COLUMN: Record<Locale, 0 | 1 | 2> = { fr: 0, en: 1, es: 2 };
const STORAGE_KEY = 'iamin-lang';

export type Params = Record<string, string | number>;

export const isLocale = (value: unknown): value is Locale => LOCALES.some((l) => l.code === value);

/** Premier choix possible parmi les langues du navigateur (« es-MX » donne « es »). */
export function detectLocale(languages: readonly string[]): Locale | null {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return null;
}

/** Remplace `{nom}` par la valeur ; un paramètre absent reste visible (jamais un texte qui disparaît). */
function fill(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/** Texte d'une clé dans une langue (hors React : textes du chat, formats). */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  return fill(MESSAGES[key][COLUMN[locale]], params);
}

/** Clés qui existent en variantes de pluriel (`clé_one`, `clé_other`…) : on donne la racine. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}_other` ? Base : never;
}[MessageKey];

/** Texte d'une racine de pluriel pour un nombre, selon les règles de la langue (Intl.PluralRules). */
export function translatePlural(
  locale: Locale,
  base: PluralKey,
  count: number,
  params?: Params,
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const wanted = `${base}_${category}` as MessageKey;
  const key = wanted in MESSAGES ? wanted : (`${base}_other` as MessageKey);
  return fill(MESSAGES[key][COLUMN[locale]], { count, ...params });
}

export interface I18n {
  locale: Locale;
  /** Choix explicite de la personne (gardé sur l'appareil) ; `null` = on suit la langue par défaut. */
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: Params) => string;
  /** Texte avec un nombre : « 1 joueur », « 2 joueurs ». */
  tn: (base: PluralKey, count: number, params?: Params) => string;
  /** Date ou heure dans la langue choisie. */
  date: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
}

function build(locale: Locale, setLocale: (l: Locale) => void): I18n {
  return {
    locale,
    setLocale,
    t: (key, params) => translate(locale, key, params),
    tn: (base, count, params) => translatePlural(locale, base, count, params),
    date: (value, options) => new Date(value).toLocaleString(locale, options),
  };
}

/** Langue en cours, lisible hors de React (messages d'erreur du client de l'API). */
let current: Locale = DEFAULT_LOCALE;
export const activeLocale = (): Locale => current;

/** Sans fournisseur (tests, composants isolés) : le français, la langue de départ du projet. */
const FALLBACK = build(DEFAULT_LOCALE, () => undefined);
const I18nContext = createContext<I18n>(FALLBACK);

/**
 * Langue de l'interface : le choix de la personne s'il existe, sinon `defaultLocale` (par exemple
 * la langue d'un tournoi sur sa page publique), sinon la langue du navigateur, sinon le français.
 */
export function I18nProvider({
  children,
  defaultLocale,
}: {
  children: ReactNode;
  defaultLocale?: Locale;
}) {
  const [chosen, setChosen] = useState<Locale | null>(() => {
    const saved = readPref(STORAGE_KEY);
    return isLocale(saved) ? saved : null;
  });
  const locale: Locale =
    chosen ??
    defaultLocale ??
    detectLocale(typeof navigator === 'undefined' ? [] : navigator.languages) ??
    DEFAULT_LOCALE;

  const setLocale = useCallback((next: Locale) => {
    writePref(STORAGE_KEY, next);
    setChosen(next);
  }, []);

  useEffect(() => {
    current = locale;
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => build(locale, setLocale), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
