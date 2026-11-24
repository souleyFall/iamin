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

/** Reconnexion du direct : attente doublée à chaque échec (2 s, 4 s… 60 s au plus). */
export const RECONNECT_BASE_MS = 2_000;
export const RECONNECT_MAX_MS = 60_000;
/** Une connexion tenue plus longtemps que cela était saine : le compte d'échecs repart de zéro. */
export const STABLE_MS = 10_000;
/** Après autant de connexions coupées aussitôt, on renonce au direct : le rafraîchissement régulier suffit. */
export const MAX_QUICK_FAILURES = 5;

/**
 * Suit le direct : à chaque message `changed` du serveur on relit la vue. Le message ne porte que
 * le numéro de révision, jamais de donnée (D18). Renvoie `true` tant que le flux est ouvert.
 *
 * La reconnexion est menée ici et non par `EventSource` : chaque navigateur rouvrait sa connexion à
 * son rythme (toutes les 5 s pour Firefox), jusqu'à épuiser la limite de débit du serveur. Ici le
 * délai double à chaque échec, et après 5 coupures immédiates d'affilée on s'en tient au
 * rafraîchissement toutes les 20 s (FALLBACK_REFRESH_MS), qui marche sans flux.
 */
export function useLive(slug: string, onChange: () => void): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let failures = 0;

    const open = () => {
      const openedAt = Date.now();
      const current = new EventSource(`${API_URL}/public/tournaments/${slug}/live`);
      source = current;
      current.onopen = () => setConnected(true);
      current.addEventListener('changed', onChange);
      current.onerror = () => {
        setConnected(false);
        current.close();
        if (stopped) return;
        failures = Date.now() - openedAt >= STABLE_MS ? 1 : failures + 1;
        if (failures > MAX_QUICK_FAILURES) return;
        const wait = Math.min(RECONNECT_BASE_MS * 2 ** (failures - 1), RECONNECT_MAX_MS);
        timer = setTimeout(open, wait);
      };
    };
    open();

    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
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
