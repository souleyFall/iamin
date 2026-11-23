import type {
  FeedbackKind,
  SecurityEventType,
  FeedbackStatus,
  Presence,
  TournamentFormat,
  TournamentStatus,
} from '../api/types';

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  IDEA: 'Idée',
  IMPROVEMENT: 'Amélioration',
  BUG: 'Bug',
  OTHER: 'Autre',
};

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  NEW: 'NOUVEAU',
  READ: 'LU',
  DONE: 'TRAITÉ',
};

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  REGISTRATION: 'INSCRIPTIONS',
  CHECK_IN: 'POINTAGE',
  STARTED: 'EN JEU',
  FINISHED: 'TERMINÉ',
};

export const STATUS_CLASS: Record<TournamentStatus, string> = {
  REGISTRATION: 'tag',
  CHECK_IN: 'tag tag-action',
  STARTED: 'tag tag-live',
  FINISHED: 'tag',
};

export const FORMAT_LABEL: Record<TournamentFormat, string> = {
  ELIMINATION: 'Élimination directe',
  LEAGUE: 'Ligue',
};

export const PRESENCE_LABEL: Record<Presence, string> = {
  UNKNOWN: 'à pointer',
  PRESENT: 'présent',
  ABSENT: 'absent',
};

/** Le tirage fige la liste : avant lui, inscriptions et pointage se modifient. */
export const isOpenStatus = (s: TournamentStatus): boolean =>
  s === 'REGISTRATION' || s === 'CHECK_IN';

/** Première lettre d'un pseudo, pour la pastille. */
export const initialOf = (name: string): string => Array.from(name.trim())[0]?.toUpperCase() ?? '?';

/** Ex. « 14 / 16 inscrits · 3 en attente ». */
export function countsLine(
  c: { pending: number; accepted: number; waitlist: number },
  cap: number,
) {
  const parts = [`${c.accepted} / ${cap} inscrits`];
  if (c.waitlist > 0) parts.push(`${c.waitlist} en liste d'attente`);
  if (c.pending > 0) parts.push(`${c.pending} en attente de validation`);
  return parts.join(' · ');
}

const EVENT_LABEL: Record<string, string> = {
  TOURNAMENT_CREATED: 'Tournoi créé',
  TOURNAMENT_UPDATED: 'Réglages modifiés',
  PLAYER_REGISTERED: 'Inscription reçue',
  PLAYER_WITHDREW: 'Un joueur a annulé son inscription',
  PLAYER_ADDED: 'Joueur ajouté par un admin',
  PLAYER_ACCEPTED: 'Inscription validée',
  PLAYER_PROMOTED: 'Liste d’attente : joueur promu',
  PLAYER_REMOVED: 'Joueur retiré',
  PRESENCE_SET: 'Présence pointée',
  DRAW_DONE: 'Tirage effectué',
  RESULT_SET: 'Score saisi',
  RESULT_DELETED: 'Score supprimé',
  PLAYER_REPLACED: 'Joueur remplacé',
  RELAY_TAKEN: 'Main prise',
  RELAY_RECLAIMED: 'Main reprise par le super admin',
  RELAY_RELEASED: 'Main rendue',
  RELAY_OFFERED: 'Relais proposé',
  RELAY_ACCEPTED: 'Relais accepté',
  RELAY_DECLINED: 'Relais refusé',
  RELAY_CANCELED: 'Proposition de relais annulée',
};

/** Texte d'un événement du journal ; un type inconnu s'affiche tel quel (jamais d'erreur). */
export const eventLabel = (type: string): string => EVENT_LABEL[type] ?? type;

export const SECURITY_EVENT_LABEL: Record<SecurityEventType, string> = {
  LOGIN_OK: 'Connexion réussie',
  LOGIN_FAILED: 'Mot de passe incorrect',
  MFA_FAILED: 'Code de double authentification incorrect',
  ACCOUNT_LOCKED: 'Compte bloqué après trop d’essais',
  MFA_ENABLED: 'Double authentification activée',
  RECOVERY_USED: 'Code de secours utilisé',
  RECOVERY_REGENERATED: 'Nouveaux codes de secours générés',
  PASSWORD_CHANGED: 'Mot de passe changé',
  PASSWORD_RESET: 'Mot de passe changé avec un lien de réinitialisation',
  RESET_LINK_ISSUED: 'Lien de réinitialisation émis pour ce compte',
  SESSIONS_REVOKED: 'Sessions fermées',
  CREATOR_INVITED: 'Super admin invité',
};

/** Événements à regarder de près : si ce n'est pas toi, change ton mot de passe et ferme les sessions. */
export const SECURITY_EVENT_ALERT: ReadonlySet<SecurityEventType> = new Set([
  'LOGIN_FAILED',
  'MFA_FAILED',
  'ACCOUNT_LOCKED',
  'RECOVERY_USED',
  'RESET_LINK_ISSUED',
]);
