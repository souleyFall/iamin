import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { LanguagePicker } from '../../components/LanguagePicker';
import {
  activeLocale,
  detectLocale,
  I18nProvider,
  LOCALES,
  translate,
  translatePlural,
  useI18n,
} from './index';
import { MESSAGES, PARTS } from './messages';

const KEYS = Object.keys(MESSAGES);
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('catalogue des textes', () => {
  it('chaque texte existe dans les trois langues, sans champ vide', () => {
    const missing = KEYS.flatMap((key) => {
      const triple = (MESSAGES as Record<string, readonly string[]>)[key] ?? [];
      return triple.length === LOCALES.length && triple.every((s) => s.trim() !== '') ? [] : [key];
    });
    expect(missing).toEqual([]);
  });

  it('aucune clé n’est définie dans deux fichiers à la fois', () => {
    const seen = new Map<string, number>();
    const duplicated: string[] = [];
    PARTS.forEach((part, index) => {
      for (const key of Object.keys(part)) {
        if (seen.has(key)) duplicated.push(key);
        seen.set(key, index);
      }
    });
    expect(duplicated).toEqual([]);
  });

  it('les trois langues utilisent les mêmes {paramètres}', () => {
    const different = KEYS.filter((key) => {
      const triple = (MESSAGES as Record<string, readonly string[]>)[key] ?? [];
      const reference = placeholders(triple[0] ?? '');
      return triple.some((text) => placeholders(text).join() !== reference.join());
    });
    expect(different).toEqual([]);
  });

  it('chaque pluriel a ses deux formes (« _one » et « _other »)', () => {
    const bases = new Set(
      KEYS.filter((k) => /_(one|other)$/.test(k)).map((k) => k.replace(/_(one|other)$/, '')),
    );
    const incomplete = [...bases].filter(
      (base) => !(`${base}_one` in MESSAGES) || !(`${base}_other` in MESSAGES),
    );
    expect(incomplete).toEqual([]);
  });

  it('les textes anglais et espagnols ne sont pas de simples copies du français', () => {
    // Quelques mots identiques sont normaux (« Admin », « Bug », « Final »), pas des pans entiers.
    const copied = KEYS.filter((key) => {
      const [fr, en, es] = (MESSAGES as Record<string, readonly string[]>)[key] ?? [];
      return (fr ?? '').length > 25 && (fr === en || fr === es);
    });
    expect(copied).toEqual([]);
  });
});

describe('traduction', () => {
  it('rend la même clé dans chaque langue', () => {
    expect(translate('fr', 'nav.me')).toBe('Moi');
    expect(translate('en', 'nav.me')).toBe('Me');
    expect(translate('es', 'nav.me')).toBe('Yo');
  });

  it('remplace les paramètres, et laisse visible un paramètre oublié', () => {
    expect(translate('en', 'reg.approveAria', { name: 'Karim_77' })).toBe('Approve Karim_77');
    expect(translate('es', 'reg.approveAria', { name: 'Karim_77' })).toBe('Validar a Karim_77');
    expect(translate('fr', 'reg.approveAria')).toBe('Valider {name}');
  });

  it('accorde les pluriels selon la langue (0 est singulier en français, pas en anglais)', () => {
    expect(translatePlural('fr', 'members.count', 0)).toBe('0 admin');
    expect(translatePlural('fr', 'members.count', 1)).toBe('1 admin');
    expect(translatePlural('fr', 'members.count', 2)).toBe('2 admins');
    expect(translatePlural('en', 'draw.byes', 1)).toBe('1 bye');
    expect(translatePlural('en', 'draw.byes', 0)).toBe('0 byes');
    expect(translatePlural('es', 'draw.byes', 1)).toBe('1 pase directo');
    expect(translatePlural('es', 'draw.byes', 3)).toBe('3 pases directos');
  });

  it('choisit la première langue du navigateur que l’application sait écrire', () => {
    expect(detectLocale(['es-MX', 'en'])).toBe('es');
    expect(detectLocale(['ja', 'en-GB'])).toBe('en');
    expect(detectLocale(['FR-ca'])).toBe('fr');
    expect(detectLocale(['ja', 'ar'])).toBeNull();
    expect(detectLocale([])).toBeNull();
  });
});

function Probe() {
  const { t, locale } = useI18n();
  return (
    <p>
      {locale}:{t('nav.tournaments')}
    </p>
  );
}

describe('fournisseur de langue', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('sans choix ni langue par défaut, suit le navigateur puis retombe sur le français', () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    // jsdom annonce « en-US » : l'anglais est la première langue reconnue.
    expect(screen.getByText('en:Tournaments')).toBeTruthy();
  });

  it('la langue par défaut (celle d’un tournoi) passe avant le navigateur', () => {
    render(
      <I18nProvider defaultLocale="es">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('es:Torneos')).toBeTruthy();
  });

  it('le choix de la personne passe avant tout et reste sur l’appareil', async () => {
    const user = userEvent.setup();
    const view = render(
      <I18nProvider defaultLocale="es">
        <LanguagePicker />
        <Probe />
      </I18nProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Français' }));
    expect(screen.getByText('fr:Tournois')).toBeTruthy();
    expect(localStorage.getItem('iamin-lang')).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');

    // Un nouveau chargement de la page retrouve le choix, même avec une autre langue par défaut.
    view.unmount();
    render(
      <I18nProvider defaultLocale="es">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('fr:Tournois')).toBeTruthy();
  });

  it('chaque langue s’écrit dans sa propre langue, et la langue active est annoncée', () => {
    render(
      <I18nProvider defaultLocale="en">
        <LanguagePicker />
      </I18nProvider>,
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Français',
      'English',
      'Español',
    ]);
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('ignore une valeur enregistrée qui n’est pas une langue connue', () => {
    localStorage.setItem('iamin-lang', 'klingon');
    render(
      <I18nProvider defaultLocale="es">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('es:Torneos')).toBeTruthy();
  });
});

describe('langue envoyée à l’API', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function stubFetch() {
    const sent: Record<string, string>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit = {}) => {
        sent.push((init.headers ?? {}) as Record<string, string>);
        return Promise.resolve(new Response('{}', { status: 200 }));
      }),
    );
    return sent;
  }

  it('chaque appel annonce la langue de l’écran (pour les messages d’erreur)', async () => {
    const sent = stubFetch();
    render(
      <I18nProvider defaultLocale="es">
        <Probe />
      </I18nProvider>,
    );
    await api('GET', '/x');
    expect(sent[0]?.['accept-language']).toBe('es');
  });

  it('la page d’un tournoi (fournisseur imbriqué) l’emporte sur celui de l’application', async () => {
    const sent = stubFetch();
    render(
      <I18nProvider defaultLocale="fr">
        <I18nProvider defaultLocale="en">
          <Probe />
        </I18nProvider>
      </I18nProvider>,
    );
    expect(screen.getByText('en:Tournaments')).toBeTruthy();
    expect(activeLocale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    await api('GET', '/x');
    expect(sent[0]?.['accept-language']).toBe('en');
  });

  it('en quittant la page du tournoi, la langue de l’application revient', () => {
    const view = render(
      <I18nProvider defaultLocale="fr">
        <I18nProvider defaultLocale="es">
          <Probe />
        </I18nProvider>
      </I18nProvider>,
    );
    expect(activeLocale()).toBe('es');
    view.unmount();
    render(
      <I18nProvider defaultLocale="fr">
        <Probe />
      </I18nProvider>,
    );
    expect(activeLocale()).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
  });
});
