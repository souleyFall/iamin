import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  CreatedInvitation,
  DrawView,
  FeedbackItem,
  FeedbackKind,
  FeedbackStatus,
  GroupDetail,
  GroupSummary,
  PendingInvitation,
  Tournament,
  TournamentSummary,
} from './types';

/** Les écrans d'un tournoi se rafraîchissent seuls : un autre admin peut avoir changé quelque chose. */
const REFRESH_MS = 5_000;

export const keys = {
  groups: ['groups'] as const,
  group: (g: string) => ['group', g] as const,
  /** Tout ce qui dépend d'un groupe : invalidé en bloc après une écriture. */
  scope: (g: string) => ['g', g] as const,
  tournaments: (g: string) => ['g', g, 'tournaments'] as const,
  tournament: (g: string, t: string) => ['g', g, 't', t] as const,
  draw: (g: string, t: string) => ['g', g, 't', t, 'draw'] as const,
  journal: (g: string, t: string) => ['g', g, 't', t, 'journal'] as const,
};

export const tournamentPath = (g: string, t: string) => `/groups/${g}/tournaments/${t}`;

/**
 * Invitations en attente et création d'un lien. `groupId` désigne les invitations d'admins d'un
 * groupe (super admin du groupe) ; sans `groupId`, les invitations de super admins (propriétaire).
 * Le lien d'une invitation n'est lisible qu'à sa création : la liste ne le renvoie jamais.
 */
export function useInvitations(groupId?: string) {
  const base = groupId ? `/groups/${groupId}/invitations` : '/creator-invitations';
  const key = ['invitations', groupId ?? 'creators'] as const;
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: key });
  return {
    list: useQuery({ queryKey: key, queryFn: () => api<PendingInvitation[]>('GET', base) }),
    create: useMutation({
      mutationFn: (platoUsername?: string) =>
        api<CreatedInvitation>('POST', base, platoUsername ? { platoUsername } : {}),
      onSuccess: refresh,
    }),
    revoke: useMutation({
      mutationFn: (id: string) => api<void>('DELETE', `${base}/${id}`),
      onSuccess: refresh,
    }),
  };
}

/** Dépose un retour : avec le compte d'un admin connecté, sinon anonymement (pseudo facultatif). */
export function useSendFeedback(signedIn: boolean) {
  return useMutation({
    mutationFn: (input: { kind: FeedbackKind; message: string; contact?: string }) =>
      api<{ id: string }>('POST', signedIn ? '/feedback' : '/public/feedback', input),
  });
}

/** Boîte de réception du propriétaire de la plateforme. */
export function useFeedbackInbox(status: FeedbackStatus | 'ALL') {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ['feedback'] });
  return {
    list: useQuery({
      queryKey: ['feedback', status],
      queryFn: () =>
        api<FeedbackItem[]>('GET', status === 'ALL' ? '/feedback' : `/feedback?status=${status}`),
    }),
    setStatus: useMutation({
      mutationFn: (v: { id: string; status: FeedbackStatus }) =>
        api<void>('PATCH', `/feedback/${v.id}`, { status: v.status }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>('DELETE', `/feedback/${id}`),
      onSuccess: refresh,
    }),
    purge: useMutation({
      mutationFn: () => api<{ deleted: number }>('POST', '/feedback/purge'),
      onSuccess: refresh,
    }),
  };
}

/** Un super admin crée un groupe dont il devient super admin. */
export function useCreateGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<{ group: { id: string; name: string } }>('POST', '/groups', { name }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.groups }),
  });
}

export function useGroups() {
  return useQuery({ queryKey: keys.groups, queryFn: () => api<GroupSummary[]>('GET', '/groups') });
}

export function useGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: keys.group(groupId ?? ''),
    queryFn: () => api<GroupDetail>('GET', `/groups/${groupId ?? ''}`),
    enabled: groupId !== undefined,
  });
}

export function useTournaments(groupId: string | undefined) {
  return useQuery({
    queryKey: keys.tournaments(groupId ?? ''),
    queryFn: () => api<TournamentSummary[]>('GET', `/groups/${groupId ?? ''}/tournaments`),
    enabled: groupId !== undefined,
    refetchInterval: REFRESH_MS,
  });
}

export function useTournament(groupId: string, tournamentId: string) {
  return useQuery({
    queryKey: keys.tournament(groupId, tournamentId),
    queryFn: () => api<Tournament>('GET', tournamentPath(groupId, tournamentId)),
    refetchInterval: REFRESH_MS,
  });
}

/** Tableau ou calendrier : n'existe qu'après le tirage (avant, l'API répond 404). */
export function useDraw(groupId: string, tournamentId: string, drawn: boolean) {
  return useQuery({
    queryKey: keys.draw(groupId, tournamentId),
    queryFn: () => api<DrawView>('GET', `${tournamentPath(groupId, tournamentId)}/draw`),
    enabled: drawn,
    refetchInterval: REFRESH_MS,
  });
}

export interface Action {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Chemin relatif au tournoi, par exemple `/draw` ou `/relay/take`. */
  path: string;
  body?: unknown;
}

/**
 * Une écriture sur un tournoi. Après succès, tout ce qui dépend du groupe est relu : la liste, le
 * tournoi, le tirage et le journal restent d'accord entre eux.
 */
export function useAction(groupId: string, tournamentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (a: Action) =>
      api<unknown>(a.method, `${tournamentPath(groupId, tournamentId)}${a.path}`, a.body),
    onSettled: () => client.invalidateQueries({ queryKey: keys.scope(groupId) }),
  });
}
