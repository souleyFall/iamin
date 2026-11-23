/**
 * Appareil lisible déduit de l'en-tête `User-Agent` : « Chrome · Windows ». C'est tout ce qu'on
 * garde (jamais le texte brut, qui sert à reconnaître un appareil précis : donnée personnelle
 * inutile ici). Il aide le titulaire d'un compte à repérer une session qui n'est pas la sienne.
 */
export function deviceLabel(userAgent: string | undefined): string {
  const ua = (userAgent ?? '').slice(0, 400);
  // L'ordre compte : Edge et Opera se disent aussi « Chrome », Chrome se dit aussi « Safari ».
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navigateur';
  const system = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux|X11/.test(ua)
            ? 'Linux'
            : 'système inconnu';
  return `${browser} · ${system}`;
}
