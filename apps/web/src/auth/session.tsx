import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { api, ApiError, setCsrfToken } from '../api/client';
import type { MfaChallenge, Session, User } from '../api/types';

interface Auth {
  /** `undefined` tant qu'on ne sait pas, `null` si personne n'est connecté. */
  user: User | null | undefined;
  /**
   * Première étape. Renvoie un jeton d'étape si le compte a la double authentification (rien n'est
   * connecté alors : il faut loginWithCode), sinon 
ull et la session est ouverte.
   */
  login: (username: string, password: string) => Promise<MfaChallenge | null>;
  /** Seconde étape : le code de l'application ou un code de secours. */
  loginWithCode: (challenge: string, code: string) => Promise<void>;
  /** Fin de la période où les actions sensibles se font sans redonner le code. */
  elevatedUntil: string | null;
  logout: () => Promise<void>;
  /** Accepte une invitation avec un nouveau compte : le crée et ouvre la session. */
  accept: (input: {
    token: string;
    username: string;
    password: string;
    platoUsername: string;
  }) => Promise<void>;
  /** Relit le compte (son rôle a pu changer : invitation de super admin utilisée en étant connecté). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);
const ME = ['me'] as const;

/** Qui est connecté ? `/auth/me` répond 401 sans session : c'est un état normal, pas une erreur. */
async function fetchMe(): Promise<Session | null> {
  try {
    const session = await api<Session>('GET', '/auth/me');
    setCsrfToken(session.csrfToken);
    return session;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setCsrfToken(undefined);
      return null;
    }
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const me = useQuery({ queryKey: ME, queryFn: fetchMe, retry: false, staleTime: 60_000 });

  const loginMutation = useMutation({
    mutationFn: (v: { username: string; password: string }) =>
      api<Session | MfaChallenge>('POST', '/auth/login', v),
    onSuccess: (result) => {
      if ('mfaRequired' in result) return; // pas de session : le code reste à donner
      setCsrfToken(result.csrfToken);
      // Cache neuf : rien d'un compte précédent ne reste affiché.
      client.clear();
      client.setQueryData(ME, result);
    },
  });
  const codeMutation = useMutation({
    mutationFn: (v: { challenge: string; code: string }) =>
      api<Session>('POST', '/auth/login/mfa', v),
    onSuccess: (session) => {
      setCsrfToken(session.csrfToken);
      client.clear();
      client.setQueryData(ME, session);
    },
  });
  const acceptMutation = useMutation({
    mutationFn: (v: { token: string; username: string; password: string; platoUsername: string }) =>
      api<Session>('POST', '/invitations/accept', v),
    onSuccess: (session) => {
      setCsrfToken(session.csrfToken);
      client.clear();
      client.setQueryData(ME, session);
    },
  });
  const logoutMutation = useMutation({
    mutationFn: () => api<void>('POST', '/auth/logout'),
    onSettled: () => {
      setCsrfToken(undefined);
      client.clear();
      client.setQueryData(ME, null);
    },
  });

  const value = useMemo<Auth>(
    () => ({
      user: me.isPending ? undefined : (me.data?.user ?? null),
      login: async (username, password) => {
        const result = await loginMutation.mutateAsync({ username, password });
        return 'mfaRequired' in result ? result : null;
      },
      loginWithCode: async (challenge, code) => {
        await codeMutation.mutateAsync({ challenge, code });
      },
      elevatedUntil: me.data?.elevatedUntil ?? null,
      logout: async () => {
        await logoutMutation.mutateAsync().catch(() => undefined);
      },
      accept: async (input) => {
        await acceptMutation.mutateAsync(input);
      },
      refresh: async () => {
        await client.invalidateQueries({ queryKey: ME });
      },
    }),
    [me.isPending, me.data, loginMutation, codeMutation, logoutMutation, acceptMutation, client],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return auth;
}
