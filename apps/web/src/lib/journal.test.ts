import { describe, expect, it } from 'vitest';
import type { JournalEvent } from '../api/types';
import { translate } from './i18n';
import { describeEvent, type JournalEnv } from './journal';

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate('fr', key, params);

const env: JournalEnv = {
  refs: {
    players: { r1: 'naruto', r2: 'sasuke', r3: 'kakashi' },
    users: { u1: 'alice', u2: 'adam' },
  },
  knownPlayers: {},
  matches: {
    R1M1: { round: 'Demi-finales', position: 1, a: 'r1', b: 'r2' },
    R2M1: { round: 'Finale', position: 1, a: 'r1', b: 'r3' },
  },
  t,
};

const event = (
  type: string,
  payload: Record<string, unknown> = {},
  actor: JournalEvent['actor'] = { id: 'u1', username: 'alice' },
): JournalEvent => ({ id: 'e', type, payload, createdAt: '2026-11-24T10:00:00Z', actor });

describe('describeEvent : le journal en phrases, avec l’admin qui a agi', () => {
  it('élimination : le vainqueur, jamais un score', () => {
    const view = describeEvent(event('RESULT_SET', { code: 'R1M1', winner: 'a' }), env);
    expect(view.title).toBe('Vainqueur désigné');
    expect(view.detail).toBe('Demi-finales, match 1 : naruto bat sasuke');
    expect(view.category).toBe('match');
    expect(view.actor).toEqual({ name: 'alice', removed: false });
  });

  it('ligue : le score, et le nul dit « match nul »', () => {
    expect(describeEvent(event('RESULT_SET', { code: 'R1M1', a: 2, b: 1 }), env).detail).toBe(
      'Demi-finales, match 1 : naruto 2-1 sasuke',
    );
    expect(describeEvent(event('RESULT_SET', { code: 'R1M1', a: 1, b: 1 }), env).detail).toBe(
      'Demi-finales, match 1 : naruto 1-1 sasuke, match nul',
    );
  });

  it('un forfait nomme celui qui abandonne', () => {
    expect(
      describeEvent(event('RESULT_SET', { code: 'R1M1', winner: 'b', forfeitBy: 'A' }), env).detail,
    ).toBe('Demi-finales, match 1 : forfait de naruto');
  });

  it('un résultat annulé dit de quel match', () => {
    expect(describeEvent(event('RESULT_DELETED', { code: 'R2M1' }), env).detail).toBe(
      'Finale, match 1 : résultat annulé',
    );
  });

  it('pointage, validation, tirage, remplacement : les noms, pas les identifiants', () => {
    expect(
      describeEvent(event('PRESENCE_SET', { registrationId: 'r1', presence: 'PRESENT' }), env)
        .detail,
    ).toBe('naruto : présent');
    expect(
      describeEvent(event('PRESENCE_SET', { registrationId: 'r2', presence: 'ABSENT' }), env)
        .detail,
    ).toBe('sasuke : absent');
    expect(
      describeEvent(event('PLAYER_ACCEPTED', { registrationId: 'r3', status: 'WAITLIST' }), env)
        .detail,
    ).toBe('kakashi : validé, en liste d’attente');
    expect(
      describeEvent(event('PLAYER_PROMOTED', { registrationIds: ['r1', 'r2'] }), env).detail,
    ).toBe('naruto, sasuke : de la liste d’attente à une place');
    expect(describeEvent(event('PLAYER_REPLACED', { outId: 'r1', inId: 'r3' }), env).detail).toBe(
      'naruto remplacé par kakashi',
    );
    expect(
      describeEvent(event('DRAW_DONE', { players: 8, seed: 'bf7393b1b666bf80', legs: 2 }), env)
        .detail,
    ).toBe('8 joueurs · graine bf7393b1… · aller-retour');
  });

  it('le relais : de qui à qui, avec les noms des admins', () => {
    expect(describeEvent(event('RELAY_OFFERED', { toUserId: 'u2' }), env).detail).toBe(
      'alice → adam',
    );
    expect(
      describeEvent(
        event('RELAY_ACCEPTED', { fromUserId: 'u1' }, { id: 'u2', username: 'adam' }),
        env,
      ).detail,
    ).toBe('alice → adam');
  });

  it('création et réglages : format, places, nuls, pointage ouvert', () => {
    expect(
      describeEvent(
        event('TOURNAMENT_CREATED', { format: 'LEAGUE', capacity: 8, allowDraws: true }),
        env,
      ).detail,
    ).toBe('Ligue · 8 places · matchs nuls autorisés');
    expect(describeEvent(event('TOURNAMENT_UPDATED', { status: 'CHECK_IN' }), env).detail).toBe(
      'Pointage ouvert',
    );
    expect(
      describeEvent(event('TOURNAMENT_UPDATED', { capacity: 16, allowDraws: false }), env).detail,
    ).toBe('Modifié : places, matchs nuls');
  });

  it('un joueur supprimé depuis n’a plus de nom : « joueur retiré »', () => {
    expect(
      describeEvent(event('PRESENCE_SET', { registrationId: 'gone', presence: 'PRESENT' }), env)
        .detail,
    ).toBe('joueur retiré : présent');
  });

  it('l’auteur : le joueur lui-même sans compte, ou un admin supprimé', () => {
    expect(
      describeEvent(event('PLAYER_REGISTERED', { registrationId: 'r1' }, null), env).actor,
    ).toEqual({
      name: 'le joueur lui-même',
      removed: false,
    });
    expect(describeEvent(event('RESULT_DELETED', { code: 'R1M1' }, null), env).actor).toEqual({
      name: 'un admin supprimé',
      removed: true,
    });
  });

  it('un match inconnu (tournoi pas encore tiré dans cette vue) reste lisible', () => {
    expect(describeEvent(event('RESULT_DELETED', { code: 'R9M9' }), env).detail).toBe(
      'Match R9M9 : résultat annulé',
    );
  });
});
