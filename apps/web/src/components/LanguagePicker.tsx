import { LOCALES, useI18n } from '../lib/i18n';

/**
 * Choix de la langue de l'interface. Chaque langue s'écrit dans sa propre langue (« Español », pas
 * « Spanish ») : on la retrouve même si on ne lit pas la langue actuelle. Gardé sur l'appareil.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={compact ? undefined : 'field'}>
      {!compact && (
        <span className="section-title" style={{ fontSize: 20 }}>
          {t('common.language')}
        </span>
      )}
      <div className="segmented" role="group" aria-label={t('common.language')}>
        {LOCALES.map((l) => (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            aria-pressed={locale === l.code}
            onClick={() => setLocale(l.code)}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
