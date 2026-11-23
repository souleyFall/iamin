/** Un texte en trois langues, dans cet ordre : français, anglais, espagnol. */
export type Triple = readonly [fr: string, en: string, es: string];

/** Garde la forme exacte des clés (pour l'autocomplétion) et refuse un texte sans ses trois langues. */
export const defineMessages = <const T extends Record<string, Triple>>(messages: T): T => messages;
