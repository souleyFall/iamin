/**
 * localStorage pour de simples préférences (thème, dernier groupe). Jamais de secret ici.
 * Tout est enveloppé : le stockage peut être absent ou refusé (navigation privée).
 */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Préférence perdue : sans conséquence.
  }
}
