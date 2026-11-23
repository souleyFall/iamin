import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { api, ApiError, setCsrfToken } from '../api/client';
import type { Session, User } from '../api/types';

interface Auth {
  /** `undefined` tant qu'on ne sait pas, `null` si personne n'est connecté. */
  user: User | null | undefined;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
      api<Session>('POST', '/auth/login', v),
    onSuccess: (session) => {
      setCsrfToken(session.csrfToken);
      // Cache neuf : rien d'un compte précédent ne reste affiché.
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
        await loginMutation.mutateAsync({ username, password });
      },
      logout: async () => {
        await logoutMutation.mutateAsync().catch(() => undefined);
      },
    }),
    [me.isPending, me.data, loginMutation, logoutMutation],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return auth;
}
