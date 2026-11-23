/**
 * Lien personnel du joueur (jeton d'inscription), gardé sur SON appareil pour qu'il retrouve son
 * statut en revenant. Ce n'est pas un secret de compte : il donne seulement le droit de voir et
 * d'annuler cette inscription (D15). Une clé par tournoi, jamais envoyé ailleurs que dans l'en-tête
 * `x-player-token` de l'API. Stockage enveloppé : il peut être absent ou refusé.
 */
const key = (slug: string) => `iamin-player-${slug}`;

export function readPlayerToken(slug: string): string | null {
  try {
    return localStorage.getItem(key(slug));
  } catch {
    return null;
  }
}

export function writePlayerToken(slug: string, token: string): void {
  try {
    localStorage.setItem(key(slug), token);
  } catch {
    // Le joueur devra garder son inscription en tête : sans conséquence pour la sécurité.
  }
}

export function clearPlayerToken(slug: string): void {
  try {
    localStorage.removeItem(key(slug));
  } catch {
    // Rien à faire.
  }
}
