import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { clearPlayerToken, writePlayerToken } from '../lib/player-token';
import { API_URL, ApiError, api } from './client';
import type { DrawView, MyRegistration, PublicView } from './types';

/**
 * Filet de sécurité : si le flux en direct est coupé (réseau, proxy, 30 minutes écoulées), la page
 * se rafraîchit quand même, plus lentement.
 */
const FALLBACK_REFRESH_MS = 20_000;

const viewKey = (slug: string) => ['public', slug, 'view'] as const;
const mineKey = (slug: string) => ['public', slug, 'mine'] as const;
const playerHeader = (token: string) => ({ 'x-player-token': token });

/**
 * Suit le direct : à chaque message `changed` du serveur on relit la vue. Le message ne porte que
 * le numéro de révision, jamais de donnée (D18). `EventSource` se reconnecte seul après une coupure.
 * Renvoie `true` tant que le flux est ouvert.
 */
export function useLive(slug: string, onChange: () => void): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(`${API_URL}/public/tournaments/${slug}/live`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener('changed', onChange);
    return () => {
      source.close();
      setConnected(false);
    };
  }, [slug, onChange]);
  return connected;
}

export function usePublicView(slug: string) {
  return useQuery({
    queryKey: viewKey(slug),
    queryFn: () => api<PublicView>('GET', `/public/tournaments/${slug}/view`),
    refetchInterval: FALLBACK_REFRESH_MS,
  });
}

/** Rend la vue publique sous la forme du tirage, pour réutiliser les écrans de l'admin. */
export function drawOf(view: PublicView): DrawView | undefined {
  return view.drawn ? { ...view, versions: {} } : undefined;
}

/**
 * Fonction stable (utile comme dépendance d'effet) qui force la relecture de la vue ET de
 * l'inscription du joueur : une validation par un admin change son statut à lui aussi.
 */
export function useInvalidateView(slug: string): () => void {
  const client = useQueryClient();
  return useCallback(
    () => void client.invalidateQueries({ queryKey: ['public', slug] }),
    [client, slug],
  );
}

/** L'inscription du joueur ; un lien périmé ou inconnu (404) est oublié. */
export function useMyRegistration(slug: string, token: string | null) {
  return useQuery({
    queryKey: [...mineKey(slug), token],
    enabled: token !== null,
    refetchInterval: FALLBACK_REFRESH_MS,
    queryFn: async () => {
      try {
        return await api<MyRegistration>(
          'GET',
          '/public/registration',
          undefined,
          playerHeader(token ?? ''),
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) clearPlayerToken(slug);
        throw e;
      }
    },
  });
}

export function useRegister(slug: string, onToken: (token: string) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<{ token: string }>('POST', `/public/tournaments/${slug}/registrations`, { name }),
    onSuccess: ({ token }) => {
      writePlayerToken(slug, token);
      onToken(token);
      void client.invalidateQueries({ queryKey: ['public', slug] });
    },
  });
}

export function useWithdraw(slug: string, token: string, onDone: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('DELETE', '/public/registration', undefined, playerHeader(token)),
    onSuccess: () => {
      clearPlayerToken(slug);
      onDone();
      void client.invalidateQueries({ queryKey: ['public', slug] });
    },
  });
}
