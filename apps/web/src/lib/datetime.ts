import type { I18n } from './i18n';

/**
 * La date d'un tournoi voyage en UTC (ISO 8601). L'admin la saisit à l'heure de son appareil ; chaque
 * personne la lit à la sienne, avec le nom de son fuseau : les joueurs Plato sont partout dans le
 * monde, « 20 h 30 » sans fuseau tromperait.
 */

/** Valeur d'un champ `datetime-local` (heure de l'appareil) vers ISO UTC ; `null` si illisible. */
export function localInputToIso(value: string): string | null {
  const date = new Date(value);
  return value === '' || Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const two = (n: number) => String(n).padStart(2, '0');

/** ISO UTC vers la valeur d'un champ `datetime-local`, à l'heure de l'appareil. */
export function isoToLocalInput(iso: string | null): string {
  if (iso === null) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** « samedi 5 décembre 2026 à 20:30 UTC+1 », dans la langue de l'écran. */
export function formatWhen(iso: string, date: I18n['date']): string {
  return date(iso, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** Le fuseau de l'appareil, par exemple « Europe/Paris ». */
export const deviceTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
