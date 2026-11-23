import { useOutletContext } from 'react-router-dom';
import type { useAction } from '../api/queries';
import type { DrawView, GroupRole, Tournament, User } from '../api/types';

/** Ce que l'écran d'un tournoi met à disposition de ses onglets. */
export interface TournamentCtx {
  groupId: string;
  groupRole: GroupRole | null;
  tournament: Tournament;
  draw: DrawView | undefined;
  me: User;
  /** Tient-on la main ? Sans elle, tout est en lecture seule (D5, D17). */
  isHolder: boolean;
  act: ReturnType<typeof useAction>;
}

export const useTournamentCtx = (): TournamentCtx => useOutletContext<TournamentCtx>();
