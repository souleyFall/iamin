import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';

/** Le lien vers la page de confidentialité, posé partout où l'on donne une donnée. */
export function PrivacyLink() {
  const { t } = useI18n();
  return <Link to="/confidentialite">{t('privacy.link')}</Link>;
}
