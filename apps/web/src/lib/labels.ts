import type {
  FeedbackKind,
  FeedbackStatus,
  Presence,
  SecurityEventType,
  TournamentFormat,
  TournamentStatus,
} from '../api/types';
import type { I18n } from './i18n';
import type { MessageKey } from './i18n/messages';

/** Les libellés sont des clés de traduction : l'écran appelle `t(...)` avec la langue du moment. */
export const FEEDBACK_KIND_KEY: Record<FeedbackKind, MessageKey> = {
  IDEA: 'feedback.kind.IDEA',
  IMPROVEMENT: 'feedback.kind.IMPROVEMENT',
  BUG: 'feedback.kind.BUG',
  OTHER: 'feedback.kind.OTHER',
};

export const FEEDBACK_STATUS_KEY: Record<FeedbackStatus, MessageKey> = {
  NEW: 'feedback.status.NEW',
  READ: 'feedback.status.READ',
  DONE: 'feedback.status.DONE',
};

export const STATUS_KEY: Record<TournamentStatus, MessageKey> = {
  REGISTRATION: 'status.registration',
  CHECK_IN: 'status.checkIn',
  STARTED: 'status.started',
  FINISHED: 'status.finished',
};

export const STATUS_CLASS: Record<TournamentStatus, string> = {
  REGISTRATION: 'tag',
  CHECK_IN: 'tag tag-action',
  STARTED: 'tag tag-live',
  FINISHED: 'tag',
};

export const FORMAT_KEY: Record<TournamentFormat, MessageKey> = {
  ELIMINATION: 'format.elimination',
  LEAGUE: 'format.league',
};

export const PRESENCE_KEY: Record<Presence, MessageKey> = {
  UNKNOWN: 'presence.unknown',
  PRESENT: 'presence.present',
  ABSENT: 'presence.absent',
};

/** Le tirage fige la liste : avant lui, inscriptions et pointage se modifient. */
export const isOpenStatus = (s: TournamentStatus): boolean =>
  s === 'REGISTRATION' || s === 'CHECK_IN';

/** Première lettre d'un pseudo, pour la pastille. */
export const initialOf = (name: string): string => Array.from(name.trim())[0]?.toUpperCase() ?? '?';

/** Ex. « 14 / 16 inscrits · 3 en attente de validation ». */
export function countsLine(
  c: { pending: number; accepted: number; waitlist: number },
  cap: number,
  t: I18n['t'],
) {
  const parts = [t('counts.registered', { accepted: c.accepted, cap })];
  if (c.waitlist > 0) parts.push(t('counts.waitlist', { n: c.waitlist }));
  if (c.pending > 0) parts.push(t('counts.pending', { n: c.pending }));
  return parts.join(' · ');
}

const EVENT_TYPES = [
  'TOURNAMENT_CREATED',
  'TOURNAMENT_UPDATED',
  'PLAYER_REGISTERED',
  'PLAYER_WITHDREW',
  'PLAYER_ADDED',
  'PLAYER_ACCEPTED',
  'PLAYER_PROMOTED',
  'PLAYER_REMOVED',
  'PRESENCE_SET',
  'DRAW_DONE',
  'RESULT_SET',
  'RESULT_DELETED',
  'PLAYER_REPLACED',
  'RELAY_TAKEN',
  'RELAY_RECLAIMED',
  'RELAY_RELEASED',
  'RELAY_OFFERED',
  'RELAY_ACCEPTED',
  'RELAY_DECLINED',
  'RELAY_CANCELED',
] as const;

/** Texte d'un événement du journal ; un type inconnu s'affiche tel quel (jamais d'erreur). */
export function eventLabel(type: string, t: I18n['t']): string {
  return (EVENT_TYPES as readonly string[]).includes(type)
    ? t(`event.${type as (typeof EVENT_TYPES)[number]}`)
    : type;
}

export const SECURITY_EVENT_KEY: Record<SecurityEventType, MessageKey> = {
  LOGIN_OK: 'security.event.LOGIN_OK',
  LOGIN_FAILED: 'security.event.LOGIN_FAILED',
  MFA_FAILED: 'security.event.MFA_FAILED',
  ACCOUNT_LOCKED: 'security.event.ACCOUNT_LOCKED',
  MFA_ENABLED: 'security.event.MFA_ENABLED',
  RECOVERY_USED: 'security.event.RECOVERY_USED',
  RECOVERY_REGENERATED: 'security.event.RECOVERY_REGENERATED',
  PASSWORD_CHANGED: 'security.event.PASSWORD_CHANGED',
  PASSWORD_RESET: 'security.event.PASSWORD_RESET',
  RESET_LINK_ISSUED: 'security.event.RESET_LINK_ISSUED',
  SESSIONS_REVOKED: 'security.event.SESSIONS_REVOKED',
  CREATOR_INVITED: 'security.event.CREATOR_INVITED',
};

/** Événements à regarder de près : si ce n'est pas toi, change ton mot de passe et ferme les sessions. */
export const SECURITY_EVENT_ALERT: ReadonlySet<SecurityEventType> = new Set([
  'LOGIN_FAILED',
  'MFA_FAILED',
  'ACCOUNT_LOCKED',
  'RECOVERY_USED',
  'RESET_LINK_ISSUED',
]);

/**
 * Nom d'un tour d'élimination : Finale, Demi-finales, Quarts de finale, sinon « Tour n ». Même règle
 * que le moteur (`bracketRoundName`), dans la langue de l'écran.
 */
export function roundName(round: number, totalRounds: number, t: I18n['t']): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return t('round.final');
  if (fromEnd === 1) return t('round.semi');
  if (fromEnd === 2) return t('round.quarter');
  return t('round.n', { n: round });
}
