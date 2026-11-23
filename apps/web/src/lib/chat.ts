import {
  bracketRoundName,
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
 * (`@iamin/engine`) : pseudos nettoyés, une information par ligne, texte brut.
 */
export function chatChoices(t: Tournament, draw: DrawView | undefined): ChatChoice[] {
  const names = namesOf(draw, t);
  const byStatus = (s: string) =>
    t.registrations.filter((r) => r.status === s).map((r) => r.platoName);
  const choices: ChatChoice[] = [
    {
      key: 'registrations',
      label: 'Liste des inscrits',
      text: formatRegistrations({
        title: t.name,
        accepted: byStatus('ACCEPTED'),
        waitlist: byStatus('WAITLIST'),
        capacity: t.capacity,
      }),
    },
  ];
  if (!draw) return choices;

  if (isBracketView(draw)) {
    const resolved: ResolvedBracket = { rounds: draw.bracket.rounds, champion: draw.champion };
    const total = resolved.rounds.length;
    for (let round = 1; round <= total; round += 1) {
      const name = bracketRoundName(round, total);
      choices.push({
        key: `vs-${round}`,
        label: `${name} : VS`,
        text: formatBracketRound(resolved, round, names, t.name),
      });
      choices.push({
        key: `results-${round}`,
        label: `${name} : résultats`,
        text: formatBracketResults(resolved, round, names, t.name),
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
    choices.push({
      key: `vs-${round}`,
      label: `Journée ${round} : VS`,
      text: formatLeagueRound(league, round, names, t.name),
    });
    choices.push({
      key: `results-${round}`,
      label: `Journée ${round} : résultats`,
      text: formatLeagueResults(league, draw.scores, round, names, t.name),
    });
  }
  choices.push({
    key: 'standings',
    label: 'Classement',
    text: formatStandings(draw.standings, names, t.name),
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
