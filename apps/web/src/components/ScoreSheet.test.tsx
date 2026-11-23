import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScoreSheet, validateScore } from './ScoreSheet';

describe('validateScore', () => {
  it('refuse l’égalité et les valeurs hors limites', () => {
    expect(validateScore({ a: 2, b: 2 }).ok).toBe(false);
    expect(validateScore({ a: 100, b: 1 }).ok).toBe(false);
    expect(validateScore({ a: -1, b: 1 }).ok).toBe(false);
    expect(validateScore({ a: 1.5, b: 1 }).ok).toBe(false);
  });

  it('désigne le vainqueur', () => {
    expect(validateScore({ a: 3, b: 1 })).toEqual({ ok: true, winner: 'a' });
    expect(validateScore({ a: 0, b: 2 })).toEqual({ ok: true, winner: 'b' });
  });
});

function setup(over: Partial<React.ComponentProps<typeof ScoreSheet>> = {}) {
  const props = {
    title: 'Match 2 · Quarts',
    nameA: 'Karim_77',
    nameB: 'Sana.fx',
    initial: null,
    forfeitScore: 1,
    pending: false,
    error: null,
    onSave: vi.fn(),
    onForfeit: vi.fn(),
    onDelete: null,
    onClose: vi.fn(),
    ...over,
  };
  render(<ScoreSheet {...props} />);
  return { props, user: userEvent.setup() };
}

describe('<ScoreSheet>', () => {
  it('empêche d’enregistrer une égalité', () => {
    setup();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Enregistrer le score' }).disabled,
    ).toBe(true);
    expect(screen.getByText('Un match ne peut pas finir à égalité.')).toBeTruthy();
  });

  it('enregistre le score saisi avec les gros boutons', async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Ajouter un point à Karim_77' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter un point à Karim_77' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter un point à Sana.fx' }));
    expect(screen.getByText('Score valide : Karim_77 gagne')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Enregistrer le score' }));
    expect(props.onSave).toHaveBeenCalledWith({ a: 2, b: 1 });
  });

  it('ne descend pas sous zéro', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Retirer un point à Karim_77' }));
    expect(screen.getByRole('status', { name: 'Score de Karim_77' }).textContent).toContain('0');
  });

  it('déclare un forfait en deux temps', async () => {
    const { props, user } = setup({ forfeitScore: 2 });
    await user.click(screen.getByRole('button', { name: 'Forfait' }));
    expect(screen.getByText(/gagne/).textContent).toContain('2-0');
    await user.click(screen.getByRole('button', { name: 'Forfait de Sana.fx' }));
    expect(props.onForfeit).toHaveBeenCalledWith('b');
  });

  it('supprime un score existant après confirmation', async () => {
    const onDelete = vi.fn();
    const { user } = setup({ initial: { a: 2, b: 0 }, onDelete });
    await user.click(screen.getByRole('button', { name: 'Supprimer le score' }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Supprimer le score' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('se ferme avec Échap et affiche l’erreur de l’API', async () => {
    const { props, user } = setup({ error: new Error('Le match suivant a déjà un score') });
    expect(screen.getByRole('alert').textContent).toContain('Le match suivant a déjà un score');
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalled();
  });
});
