import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextStep } from './NextStep';

/** L'étape suivante arrive toute seule après un court délai, ou tout de suite à la demande. */
describe('<NextStep>', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (seconds = 3) => {
    const onGo = vi.fn();
    const onStay = vi.fn();
    render(
      <NextStep
        message="Pointage terminé : tout le monde est noté."
        label="Passage au tirage"
        seconds={seconds}
        onGo={onGo}
        onStay={onStay}
      />,
    );
    return { onGo, onStay };
  };

  it('annonce l’étape et y va tout seul après le délai', () => {
    const { onGo } = setup(3);
    expect(screen.getByText('Pointage terminé : tout le monde est noté.')).toBeTruthy();
    expect(screen.getByText('Passage au tirage dans 3 s')).toBeTruthy();
    // Une seconde à la fois : chaque tic relance le suivant après le rendu.
    void act(() => vi.advanceTimersByTime(1_000));
    void act(() => vi.advanceTimersByTime(1_000));
    expect(onGo).not.toHaveBeenCalled();
    expect(screen.getByText('Passage au tirage dans 1 s')).toBeTruthy();
    void act(() => vi.advanceTimersByTime(1_000));
    expect(onGo).toHaveBeenCalledOnce();
  });

  it('« Y aller » passe tout de suite à l’étape suivante', async () => {
    vi.useRealTimers();
    const { onGo } = setup(30);
    await userEvent.click(screen.getByRole('button', { name: 'Y aller' }));
    expect(onGo).toHaveBeenCalledOnce();
  });

  it('« Rester ici » prévient le parent, qui retire l’annonce', async () => {
    vi.useRealTimers();
    const { onStay, onGo } = setup(30);
    await userEvent.click(screen.getByRole('button', { name: 'Rester ici' }));
    expect(onStay).toHaveBeenCalledOnce();
    expect(onGo).not.toHaveBeenCalled();
  });

  it('annoncée une seule fois aux lecteurs d’écran : le compte à rebours est masqué', () => {
    setup(3);
    expect(screen.getByRole('status').textContent).toContain('Pointage terminé');
    expect(screen.getByText('Passage au tirage dans 3 s').getAttribute('aria-hidden')).toBe('true');
  });
});
