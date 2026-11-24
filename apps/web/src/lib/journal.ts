import type { Journal, JournalEvent } from '../api/types';
import type { I18n } from './i18n';
import { eventLabel, FORMAT_KEY } from './labels';

/** Famille d'un événement : une couleur et un repère pour s'y retrouver d'un coup d'œil. */
export type EventCategory = 'players' | 'checkin' | 'draw' | 'match' | 'relay' | 'settings';

export const CATEGORY: Record<string, EventCategory> = {
  TOURNAMENT_CREATED: 'settings',
  TOURNAMENT_UPDATED: 'settings',
  PLAYER_REGISTERED: 'players',
  PLAYER_WITHDREW: 'players',
  PLAYER_ADDED: 'players',
  PLAYER_ACCEPTED: 'players',
  PLAYER_PROMOTED: 'players',
  PLAYER_REMOVED: 'players',
  PRESENCE_SET: 'checkin',
  DRAW_DONE: 'draw',
  PLAYER_REPLACED: 'draw',
  RESULT_SET: 'match',
  RESULT_DELETED: 'match',
  RELAY_TAKEN: 'relay',
  RELAY_RECLAIMED: 'relay',
  RELAY_RELEASED: 'relay',
  RELAY_OFFERED: 'relay',
  RELAY_ACCEPTED: 'relay',
  RELAY_DECLINED: 'relay',
  RELAY_CANCELED: 'relay',
};

/** Les événements qu'un joueur déclenche lui-même, sans compte : pas d'admin derrière. */
const BY_PLAYER = new Set(['PLAYER_REGISTERED', 'PLAYER_WITHDREW']);

/** Ce dont le journal a besoin pour parler en noms et non en identifiants. */
export interface JournalEnv {
  refs: Journal['refs'];
  /** Pseudos connus par ailleurs (inscrits actuels, joueurs du tirage). */
  knownPlayers: Record<string, string>;
  /** Pour chaque code de match : son tour, sa place dans le tour et ses joueurs actuels. */
  matches: Record<string, { round: string; position: number; a: string | null; b: string | null }>;
  t: I18n['t'];
}

const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const count = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export interface EventView {
  category: EventCategory;
  title: string;
  /** Phrase lisible avec les noms ; `null` s'il n'y a rien de plus à dire. */
  detail: string | null;
  /** Qui a fait l'action : un admin, ou le joueur lui-même. */
  actor: { name: string; removed: boolean };
}

/**
 * Traduit un événement du journal en une ligne lisible : un titre, une phrase avec les noms des
 * joueurs et des admins, l'auteur. La charge enregistrée ne contient que des identifiants (jamais un
 * pseudo) ; les noms viennent de `refs`, retrouvés à la lecture. Un joueur supprimé depuis devient
 * « joueur retiré ».
 */
export function describeEvent(e: JournalEvent, env: JournalEnv): EventView {
  const { t } = env;
  const p = e.payload;
  const player = (id: unknown): string => {
    const key = text(id);
    return (key && (env.refs.players[key] ?? env.knownPlayers[key])) || t('journal.player.removed');
  };
  const account = (id: unknown): string => {
    const key = text(id);
    return (key && env.refs.users[key]) || t('journal.actor.removed');
  };
  const matchOf = (code: unknown) => {
    const key = text(code);
    const m = key ? env.matches[key] : undefined;
    return {
      label: m
        ? t('journal.matchIn', { round: m.round, n: m.position })
        : t('journal.match', { n: key ?? '?' }),
      a: m?.a ?? null,
      b: m?.b ?? null,
    };
  };

  let detail: string | null;
  switch (e.type) {
    case 'PLAYER_REGISTERED':
    case 'PLAYER_WITHDREW':
    case 'PLAYER_ADDED':
    case 'PLAYER_REMOVED':
      detail = player(p.registrationId);
      break;
    case 'PLAYER_ACCEPTED': {
      const status =
        p.status === 'WAITLIST' ? 'journal.status.WAITLIST' : 'journal.status.ACCEPTED';
      detail = t('journal.d.accepted', {
        name: player(p.registrationId),
        status: t(status),
      });
      break;
    }
    case 'PLAYER_PROMOTED': {
      const ids = Array.isArray(p.registrationIds) ? p.registrationIds : [];
      detail = t('journal.d.promoted', { names: ids.map(player).join(', ') });
      break;
    }
    case 'PRESENCE_SET': {
      const state = (['PRESENT', 'ABSENT'] as const).find((s) => s === p.presence) ?? 'UNKNOWN';
      detail = t('journal.d.presence', {
        name: player(p.registrationId),
        state: t(`journal.presence.${state}`),
      });
      break;
    }
    case 'DRAW_DONE': {
      const n = count(p.players) ?? 0;
      const seed = (text(p.seed) ?? '').slice(0, 8);
      detail = t('journal.d.drawDone', { n, seed });
      if (p.legs === 2) detail += ` · ${t('journal.d.legs2')}`;
      break;
    }
    case 'PLAYER_REPLACED':
      detail = t('journal.d.replaced', { out: player(p.outId), in: player(p.inId) });
      break;
    case 'RESULT_SET': {
      const m = matchOf(p.code);
      const side = p.forfeitBy === 'A' ? m.a : p.forfeitBy === 'B' ? m.b : null;
      const aName = m.a ? player(m.a) : '?';
      const bName = m.b ? player(m.b) : '?';
      if (p.forfeitBy === 'A' || p.forfeitBy === 'B') {
        detail = t('journal.d.forfeit', {
          match: m.label,
          name: side ? player(side) : p.forfeitBy === 'A' ? aName : bName,
        });
      } else if (p.winner === 'a' || p.winner === 'b') {
        // Élimination directe : pas de score, seulement le vainqueur.
        detail = t('journal.d.winnerOver', {
          match: m.label,
          winner: p.winner === 'a' ? aName : bName,
          loser: p.winner === 'a' ? bName : aName,
        });
      } else {
        const sa = count(p.a) ?? 0;
        const sb = count(p.b) ?? 0;
        detail = t(sa === sb ? 'journal.d.draw' : 'journal.d.score', {
          match: m.label,
          a: aName,
          b: bName,
          sa,
          sb,
        });
      }
      break;
    }
    case 'RESULT_DELETED':
      detail = t('journal.d.deleted', { match: matchOf(p.code).label });
      break;
    case 'RELAY_OFFERED':
    case 'RELAY_CANCELED':
      detail = t('journal.d.relay', { from: e.actor?.username ?? '?', to: account(p.toUserId) });
      break;
    case 'RELAY_ACCEPTED':
    case 'RELAY_DECLINED':
    case 'RELAY_RECLAIMED':
      detail = t('journal.d.relay', { from: account(p.fromUserId), to: e.actor?.username ?? '?' });
      break;
    case 'TOURNAMENT_CREATED': {
      const format = (['ELIMINATION', 'LEAGUE'] as const).find((f) => f === p.format);
      const label = format ? t(FORMAT_KEY[format]) : '';
      detail = t('journal.d.created', { format: label, n: count(p.capacity) ?? 0 });
      if (p.allowDraws === true) detail += ` · ${t('journal.d.drawsAllowed')}`;
      break;
    }
    case 'TOURNAMENT_UPDATED': {
      if (p.status === 'CHECK_IN') {
        detail = t('journal.d.checkInOpened');
        break;
      }
      const fields = (
        ['name', 'capacity', 'language', 'forfeitScore', 'allowDraws', 'status'] as const
      ).filter((k) => p[k] !== undefined);
      detail =
        fields.length > 0
          ? t('journal.d.updated', {
              fields: fields.map((k) => t(`journal.field.${k}`)).join(', '),
            })
          : null;
      break;
    }
    default:
      detail = null;
  }

  const name = e.actor?.username;
  return {
    category: CATEGORY[e.type] ?? 'settings',
    // Élimination directe : on désigne un vainqueur, on ne « saisit » pas de score.
    title:
      e.type === 'RESULT_SET' && p.winner !== undefined
        ? t('journal.winnerPicked')
        : eventLabel(e.type, t),
    detail,
    actor: name
      ? { name, removed: false }
      : BY_PLAYER.has(e.type)
        ? { name: t('journal.actor.player'), removed: false }
        : { name: t('journal.actor.removed'), removed: true },
  };
}
