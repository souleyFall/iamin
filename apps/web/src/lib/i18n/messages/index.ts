import { adminLabels } from './admin-labels';
import { auth } from './auth';
import { common } from './common';
import { screensBasic } from './screens-basic';
import { feedback } from './feedback';
import { play } from './play';
import { publicPage } from './public';
import { security } from './security';
import { tournaments } from './tournaments';

/**
 * Tous les textes de l'interface, chacun en français, anglais et espagnol (dans cet ordre). Un
 * texte sans ses trois langues ne compile pas (`defineMessages`), et un test refuse une clé en
 * double entre deux fichiers. Ajouter une langue : une colonne par texte, puis la déclarer dans
 * `lib/i18n/index.tsx`.
 */
export const PARTS = [
  common,
  screensBasic,
  adminLabels,
  tournaments,
  play,
  security,
  feedback,
  auth,
  publicPage,
] as const;

export const MESSAGES = Object.assign({}, ...PARTS) as typeof common &
  typeof screensBasic &
  typeof adminLabels &
  typeof tournaments &
  typeof play &
  typeof security &
  typeof feedback &
  typeof auth &
  typeof publicPage;

export type MessageKey = keyof typeof MESSAGES;
