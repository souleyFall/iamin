import type { LeagueMatch, ResolvedMatch, Score, Standings } from '@iamin/engine';

/** Formes des réponses de l'API (voir apps/api). Écrites à la main : l'API est la référence. */

/** `GROUP_CREATOR` = « super admin » : invité par le propriétaire, seul à pouvoir créer des groupes. */
export type Role = 'PLATFORM_OWNER' | 'GROUP_CREATOR' | 'MEMBER';
export type GroupRole = 'SUPER_ADMIN' | 'ADMIN';
export type TournamentFormat = 'ELIMINATION' | 'LEAGUE';
/** Langue d'un tournoi : celle de la page des joueurs et du texte du chat (choisie par l'admin). */
export type TournamentLanguage = 'fr' | 'en' | 'es';
export type TournamentStatus = 'REGISTRATION' | 'CHECK_IN' | 'STARTED' | 'FINISHED';
export type RegistrationStatus = 'PENDING' | 'ACCEPTED' | 'WAITLIST' | 'REPLACED';
export type Presence = 'UNKNOWN' | 'PRESENT' | 'ABSENT';

export interface User {
  id: string;
  username: string;
  platoUsername: string;
  role: Role;
  /** La double authentification est active sur ce compte. */
  mfaEnabled: boolean;
}

export interface Session {
  user: User;
  csrfToken: string;
  /** Fin de la période où les actions sensibles se font sans redonner le code. */
  elevatedUntil?: string | null;
}

/** Première étape de connexion avec la double authentification : pas de session, un jeton d'étape. */
export interface MfaChallenge {
  mfaRequired: true;
  challenge: string;
}

export interface MfaStatus {
  enabled: boolean;
  /** Obligatoire pour ce compte (le propriétaire de la plateforme). */
  required: boolean;
  recoveryCodesLeft: number;
}

export interface SessionInfo {
  id: string;
  /** « Chrome · Windows » : navigateur et système, jamais l'adresse IP. */
  device: string | null;
  createdAt: string;
  lastSeenAt: string;
  /** La session qui fait la demande. */
  current: boolean;
}

export type SecurityEventType =
  | 'LOGIN_OK'
  | 'LOGIN_FAILED'
  | 'MFA_FAILED'
  | 'ACCOUNT_LOCKED'
  | 'MFA_ENABLED'
  | 'RECOVERY_USED'
  | 'RECOVERY_REGENERATED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'RESET_LINK_ISSUED'
  | 'SESSIONS_REVOKED'
  | 'CREATOR_INVITED';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  device: string | null;
  createdAt: string;
}

export interface MfaSetup {
  secret: string;
  otpauthUrl: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  myRole: GroupRole | null;
  memberCount: number;
}

export interface GroupDetail {
  id: string;
  name: string;
  myRole: GroupRole | null;
  members: { userId: string; username: string; platoUsername: string; role: GroupRole }[];
}

/** Invitation qu'on vient de créer : le lien n'est montré qu'à cet instant. */
export interface CreatedInvitation {
  id: string;
  /** `null` pour l'invitation d'un super admin (aucun groupe encore). */
  groupId: string | null;
  groupRole: GroupRole | null;
  platoUsername: string | null;
  expiresAt: string;
  url: string;
}

export interface PendingInvitation {
  id: string;
  /** Absent pour les invitations de super admins. */
  groupRole?: GroupRole;
  /** Pseudo Plato imposé à la personne invitée, ou 
ull si elle le choisit. */
  platoUsername: string | null;
  createdAt: string;
  expiresAt: string;
}

export type FeedbackKind = 'IDEA' | 'IMPROVEMENT' | 'BUG' | 'OTHER';
export type FeedbackStatus = 'NEW' | 'READ' | 'DONE';

/** Un retour vu par le propriétaire de la plateforme. */
export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  message: string;
  /** Pseudo Plato laissé par un joueur sans compte. */
  contact: string | null;
  /** Compte admin qui l'a déposé ; `null` pour un joueur sans compte. */
  author: { username: string } | null;
  status: FeedbackStatus;
  createdAt: string;
  handledAt: string | null;
}

export interface Person {
  id: string;
  username: string;
}

export interface Registration {
  id: string;
  platoName: string;
  status: RegistrationStatus;
  presence: Presence;
  createdAt: string;
}

export interface TournamentSummary {
  id: string;
  name: string;
  format: TournamentFormat;
  capacity: number;
  status: TournamentStatus;
  publicSlug: string;
  forfeitScore: number;
  /** Ligue : un match peut finir à égalité. Toujours faux en élimination directe. */
  allowDraws: boolean;
  language: TournamentLanguage;
  /** Date et heure prévues, en UTC ; `null` pour un tournoi sans date. */
  startsAt: string | null;
  createdAt: string;
  drawnAt: string | null;
  drawSeed: string | null;
  holder: Person | null;
  handoverTo: Person | null;
  counts: { pending: number; accepted: number; waitlist: number };
}

export interface Tournament extends Omit<TournamentSummary, 'counts'> {
  registrations: Registration[];
}

// ---- Tirage, matchs ----------------------------------------------------------------------------

export type { LeagueMatch, Score, StandingRow, Standings } from '@iamin/engine';
export type BracketMatch = ResolvedMatch;

export interface DrawPlayer {
  id: string;
  platoName: string;
  status: RegistrationStatus;
}

interface DrawCommon {
  format: TournamentFormat;
  status: TournamentStatus;
  seed: string | null;
  drawnAt: string | null;
  initialPlayers: string[];
  forfeitScore: number;
  allowDraws: boolean;
  players: DrawPlayer[];
  /** Version de chaque score : à renvoyer en le corrigeant. */
  versions: Record<string, number>;
  forfeits: Record<string, 'A' | 'B' | null>;
}

export interface BracketView extends DrawCommon {
  bracket: { size: number; byes: number; rounds: BracketMatch[][] };
  champion: string | null;
}

export interface LeagueView extends DrawCommon {
  schedule: { legs: 1 | 2; rounds: LeagueMatch[][]; rests: (string | null)[] };
  scores: Record<string, Score>;
  standings: Standings;
}

export type DrawView = BracketView | LeagueView;

export const isBracketView = (v: DrawView): v is BracketView => 'bracket' in v;

// ---- Pages publiques (sans compte) -------------------------------------------------------------

/** Ce que la page publique lit : jamais d'inscription en attente, de jeton ni de détenteur. */
export interface PublicHead {
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  language: TournamentLanguage;
  startsAt: string | null;
  registrationOpen: boolean;
  revision: number;
}

export type PublicView =
  | (PublicHead & {
      drawn: false;
      players: { id: string; platoName: string; status: RegistrationStatus }[];
    })
  | (PublicHead & Omit<BracketView, 'versions'> & { drawn: true })
  | (PublicHead & Omit<LeagueView, 'versions'> & { drawn: true });

/** L'inscription du joueur, retrouvée grâce à son lien personnel. */
export interface MyRegistration {
  id: string;
  platoName: string;
  status: RegistrationStatus;
  presence: Presence;
  waitlistPosition: number | null;
  tournament: { name: string; status: TournamentStatus };
}

// ---- Journal -----------------------------------------------------------------------------------

// ---- Tableau de bord du propriétaire (lecture seule, D30) --------------------------------------

export type PersonKind = 'SUPER_ADMIN' | 'ADMIN' | 'NONE';

export interface OverviewPerson {
  id: string;
  username: string;
  platoUsername: string;
  kind: PersonKind;
  createdAt: string;
  /** `null` : aucune activité depuis 30 jours. */
  lastActiveAt: string | null;
  groups: { id: string; name: string; role: GroupRole }[];
}

export interface OverviewGroup {
  id: string;
  name: string;
  createdAt: string;
  superAdmins: Person[];
  admins: Person[];
  tournaments: { total: number; running: number; finished: number };
  registrations: number;
  lastTournamentAt: string | null;
}

export interface Overview {
  generatedAt: string;
  accounts: { total: number; superAdmins: number; admins: number };
  active: { online: number; week: number; month: number };
  tournaments: { total: number } & Record<TournamentStatus, number>;
  registrations: {
    total: number;
    accepted: number;
    waitlist: number;
    pending: number;
    players: number;
  };
  groups: OverviewGroup[];
  people: OverviewPerson[];
}

export interface OverviewTournament {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  capacity: number;
  createdAt: string;
  drawnAt: string | null;
  startsAt: string | null;
  group: { id: string; name: string };
  holder: string | null;
  counts: { accepted: number; waitlist: number; pending: number };
}

export interface OverviewTournamentPage {
  total: number;
  tournaments: OverviewTournament[];
  nextBefore: string | null;
}

export interface JournalEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: Person | null;
}

export interface Journal {
  events: JournalEvent[];
  nextBefore: string | null;
  /** Noms retrouvés à la lecture (jamais copiés dans le journal) : joueurs et admins cités. */
  refs: { players: Record<string, string>; users: Record<string, string> };
}
