import type { LeagueMatch, ResolvedMatch, Score, Standings } from '@iamin/engine';

/** Formes des réponses de l'API (voir apps/api). Écrites à la main : l'API est la référence. */

/** `GROUP_CREATOR` = « super admin » : invité par le propriétaire, seul à pouvoir créer des groupes. */
export type Role = 'PLATFORM_OWNER' | 'GROUP_CREATOR' | 'MEMBER';
export type GroupRole = 'SUPER_ADMIN' | 'ADMIN';
export type TournamentFormat = 'ELIMINATION' | 'LEAGUE';
export type TournamentStatus = 'REGISTRATION' | 'CHECK_IN' | 'STARTED' | 'FINISHED';
export type RegistrationStatus = 'PENDING' | 'ACCEPTED' | 'WAITLIST' | 'REPLACED';
export type Presence = 'UNKNOWN' | 'PRESENT' | 'ABSENT';

export interface User {
  id: string;
  username: string;
  platoUsername: string;
  role: Role;
}

export interface Session {
  user: User;
  csrfToken: string;
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
  expiresAt: string;
  url: string;
}

export interface PendingInvitation {
  id: string;
  /** Absent pour les invitations de super admins. */
  groupRole?: GroupRole;
  createdAt: string;
  expiresAt: string;
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
}
