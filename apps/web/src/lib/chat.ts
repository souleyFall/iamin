import {
  formatBracketResults,
  formatBracketRound,
  formatLeagueResults,
  formatLeagueRound,
  formatRegistrations,
  formatStandings,
  type League,
  type Names,
  type ResolvedBracket,
} from '@iamin/engine';
import { isBracketView, type DrawView, type Tournament } from '../api/types';
import type { I18n } from './i18n';
import { roundName } from './labels';

export interface ChatChoice {
  key: string;
  label: string;
  text: string;
}

/** Identifiant du joueur → pseudo (les remplacés y restent : d'anciens scores les citent). */
export function namesOf(draw: DrawView | undefined, t: Tournament): Names {
  const names: Record<string, string> = {};
  for (const r of t.registrations) names[r.id] = r.platoName;
  for (const p of draw?.players ?? []) names[p.id] = p.platoName;
  return names;
}

/**
 * Les messages que l'admin peut copier dans le chat Plato. Le texte vient du moteur
 * (`@iamin/engine`) : pseudos nettoyés, une information par ligne, texte brut. Les noms du menu
 * suivent la langue de l'écran.
 */
export function chatChoices(
  tournament: Tournament,
  draw: DrawView | undefined,
  t: I18n['t'],
): ChatChoice[] {
  const names = namesOf(draw, tournament);
  const byStatus = (s: string) =>
    tournament.registrations.filter((r) => r.status === s).map((r) => r.platoName);
  const choices: ChatChoice[] = [
    {
      key: 'registrations',
      label: t('chat.registrations'),
      text: formatRegistrations({
        title: tournament.name,
        accepted: byStatus('ACCEPTED'),
        waitlist: byStatus('WAITLIST'),
        capacity: tournament.capacity,
        locale: tournament.language,
      }),
    },
  ];
  if (!draw) return choices;

  if (isBracketView(draw)) {
    const resolved: ResolvedBracket = { rounds: draw.bracket.rounds, champion: draw.champion };
    const total = resolved.rounds.length;
    for (let round = 1; round <= total; round += 1) {
      const name = roundName(round, total, t);
      choices.push({
        key: `vs-${round}`,
        label: t('chat.vs', { name }),
        text: formatBracketRound(resolved, round, names, tournament.name, tournament.language),
      });
      choices.push({
        key: `results-${round}`,
        label: t('chat.results', { name }),
        text: formatBracketResults(resolved, round, names, tournament.name, tournament.language),
      });
    }
    return choices;
  }

  const league: League = {
    seed: draw.seed ?? '',
    draw: draw.initialPlayers,
    legs: draw.schedule.legs,
    rounds: draw.schedule.rounds,
    rests: draw.schedule.rests,
  };
  for (let round = 1; round <= league.rounds.length; round += 1) {
    const name = t('chat.round', { n: round });
    choices.push({
      key: `vs-${round}`,
      label: t('chat.vs', { name }),
      text: formatLeagueRound(league, round, names, tournament.name, tournament.language),
    });
    choices.push({
      key: `results-${round}`,
      label: t('chat.results', { name }),
      text: formatLeagueResults(
        league,
        draw.scores,
        round,
        names,
        tournament.name,
        tournament.language,
      ),
    });
  }
  choices.push({
    key: 'standings',
    label: t('chat.standings'),
    text: formatStandings(draw.standings, names, tournament.name, tournament.language),
  });
  return choices;
}

/** Copie dans le presse-papiers ; `false` si le navigateur le refuse (page non sécurisée, etc.). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
