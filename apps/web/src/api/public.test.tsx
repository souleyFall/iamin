import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_QUICK_FAILURES, STABLE_MS, useLive } from './public';

/** Le direct se reconnecte à son rythme, en s'espaçant, et abandonne si le flux se coupe aussitôt. */
class FakeSource {
  static all: FakeSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeSource.all.push(this);
  }
  addEventListener() {}
  close() {
    this.closed = true;
  }
}

const onChange = () => undefined;

describe('useLive : reconnexion', () => {
  beforeEach(() => {
    FakeSource.all = [];
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeSource);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('espace les reconnexions (2 s, 4 s, 8 s…) au lieu de se rouvrir tout de suite', () => {
    renderHook(() => useLive('slug', onChange));
    expect(FakeSource.all).toHaveLength(1);

    void act(() => FakeSource.all[0]?.onerror?.());
    void act(() => vi.advanceTimersByTime(1_999));
    expect(FakeSource.all).toHaveLength(1); // pas encore
    void act(() => vi.advanceTimersByTime(1));
    expect(FakeSource.all).toHaveLength(2);

    void act(() => FakeSource.all[1]?.onerror?.());
    void act(() => vi.advanceTimersByTime(3_999));
    expect(FakeSource.all).toHaveLength(2);
    void act(() => vi.advanceTimersByTime(1));
    expect(FakeSource.all).toHaveLength(3);
  });

  it('ferme la connexion en erreur : le navigateur ne la rouvre pas lui-même', () => {
    renderHook(() => useLive('slug', onChange));
    void act(() => FakeSource.all[0]?.onerror?.());
    expect(FakeSource.all[0]?.closed).toBe(true);
  });

  it('renonce au direct après des coupures immédiates répétées (le rafraîchissement régulier prend le relais)', () => {
    renderHook(() => useLive('slug', onChange));
    for (let i = 0; i < MAX_QUICK_FAILURES + 3; i++) {
      void act(() => FakeSource.all.at(-1)?.onerror?.());
      // Déclenche la reconnexion prévue sans laisser « vivre » la nouvelle connexion (le temps
      // qui passe la rendrait saine, et le compte d'échecs repartirait de zéro).
      void act(() => vi.runOnlyPendingTimers());
    }
    // 1 ouverture + autant de réessais que le plafond le permet, puis plus rien.
    expect(FakeSource.all).toHaveLength(MAX_QUICK_FAILURES + 1);
    void act(() => vi.advanceTimersByTime(600_000));
    expect(FakeSource.all).toHaveLength(MAX_QUICK_FAILURES + 1);
  });

  it('une connexion tenue longtemps est saine : le compte d’échecs repart de zéro', () => {
    renderHook(() => useLive('slug', onChange));
    for (let i = 0; i < MAX_QUICK_FAILURES + 3; i++) {
      void act(() => vi.advanceTimersByTime(STABLE_MS + 1));
      void act(() => FakeSource.all.at(-1)?.onerror?.());
      void act(() => vi.advanceTimersByTime(2_000));
    }
    // Jamais d'abandon : chaque coupure survient après une connexion saine.
    expect(FakeSource.all).toHaveLength(MAX_QUICK_FAILURES + 4);
  });

  it('quitter la page ferme le flux et annule la reconnexion prévue', () => {
    const { unmount } = renderHook(() => useLive('slug', onChange));
    void act(() => FakeSource.all[0]?.onerror?.());
    unmount();
    void act(() => vi.advanceTimersByTime(120_000));
    expect(FakeSource.all).toHaveLength(1);
  });
});
