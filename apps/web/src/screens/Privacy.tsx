import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LanguagePicker } from '../components/LanguagePicker';
import { useI18n } from '../lib/i18n';
import type { MessageKey } from '../lib/i18n/messages';

/** À changer à chaque modification du contenu de la page. */
export const PRIVACY_UPDATED = '2026-11-27';

const SECTIONS: { title: MessageKey; items: MessageKey[] }[] = [
  { title: 'privacy.who.title', items: ['privacy.who.name', 'privacy.who.contact'] },
  {
    title: 'privacy.players.title',
    items: [
      'privacy.players.data',
      'privacy.players.why',
      'privacy.players.public',
      'privacy.players.who',
    ],
  },
  {
    title: 'privacy.admins.title',
    items: [
      'privacy.admins.data',
      'privacy.admins.security',
      'privacy.admins.who',
      'privacy.admins.basis',
    ],
  },
  {
    title: 'privacy.other.title',
    items: ['privacy.other.feedback', 'privacy.other.log', 'privacy.other.ip'],
  },
  {
    title: 'privacy.device.title',
    items: ['privacy.device.cookie', 'privacy.device.storage', 'privacy.device.noTracking'],
  },
  {
    title: 'privacy.keep.title',
    items: [
      'privacy.keep.players',
      'privacy.keep.accounts',
      'privacy.keep.security',
      'privacy.keep.other',
    ],
  },
  {
    title: 'privacy.rights.title',
    items: ['privacy.rights.list', 'privacy.rights.admin', 'privacy.rights.complaint'],
  },
];

/** Information des personnes (RGPD, articles 13 et 14) : publique, sans compte. */
export function Privacy() {
  const { t, date } = useI18n();
  const navigate = useNavigate();
  return (
    <main className="legal">
      <header className="topbar">
        <button
          type="button"
          className="icon-btn flat"
          aria-label={t('common.back')}
          onClick={() => void navigate(-1)}
        >
          <Icon name="back" size={24} />
        </button>
        <h1 className="title">{t('privacy.title')}</h1>
      </header>
      <div className="page">
        <p className="muted">
          {t('privacy.updated', {
            date: date(PRIVACY_UPDATED, { day: 'numeric', month: 'long', year: 'numeric' }),
          })}
        </p>
        <p>{t('privacy.intro')}</p>
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="section-title">{t(section.title)}</h2>
            <ul className="legal-list">
              {section.items.map((item) => (
                <li key={item}>{t(item)}</li>
              ))}
            </ul>
          </section>
        ))}
        <Link className="btn" to="/avis">
          {t('fb.title')}
        </Link>
        <LanguagePicker compact />
      </div>
    </main>
  );
}
