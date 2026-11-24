import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WinnerSheet } from './WinnerSheet';

function setup(over: Partial<React.ComponentProps<typeof WinnerSheet>> = {}) {
  const props = {
    title: 'Match 2 · Quarts',
    nameA: 'Karim_77',
    nameB: 'Sana.fx',
    current: null,
    pending: false,
    error: null,
    onPick: vi.fn(),
    onForfeit: vi.fn(),
    onDelete: null,
    onClose: vi.fn(),
    ...over,
  };
  render(<WinnerSheet {...props} />);
  return { props, user: userEvent.setup() };
}

describe('<WinnerSheet> (élimination directe : pas de score)', () => {
  it('désigne le vainqueur d’un seul clic, sans aucune saisie de score', async () => {
    const { props, user } = setup();
    expect(screen.queryByRole('button', { name: /Ajouter un point/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer le score' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sana.fx gagne' }));
    expect(props.onPick).toHaveBeenCalledWith('b');
    await user.click(screen.getByRole('button', { name: 'Karim_77 gagne' }));
    expect(props.onPick).toHaveBeenCalledWith('a');
  });

  it('rappelle le vainqueur actuel quand on corrige un résultat', () => {
    setup({ current: 'b' });
    expect(screen.getByText('Vainqueur actuel : Sana.fx')).toBeTruthy();
  });

  it('déclare un forfait en deux temps : l’autre joueur gagne', async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Forfait' }));
    expect(screen.getByText('Qui déclare forfait ? L’autre joueur gagne.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Forfait de Karim_77' }));
    expect(props.onForfeit).toHaveBeenCalledWith('a');
  });

  it('annule un résultat seulement après confirmation', async () => {
    const onDelete = vi.fn();
    const { user } = setup({ current: 'a', onDelete });
    await user.click(screen.getByRole('button', { name: 'Annuler le résultat' }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Annuler le résultat' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('se ferme avec Échap et montre l’erreur de l’API', async () => {
    const { props, user } = setup({ error: new Error('Le match suivant a déjà un score') });
    expect(screen.getByRole('alert').textContent).toContain('Le match suivant a déjà un score');
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalled();
  });
});
