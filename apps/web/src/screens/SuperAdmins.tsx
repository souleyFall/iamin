import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/session';
import { Icon } from '../components/Icon';
import { ElevationPrompt, useElevated } from '../components/Elevation';
import { InvitationManager } from '../components/InvitationManager';
import { useI18n } from '../lib/i18n';

/** Le propriétaire de la plateforme valide les super admins en leur envoyant un lien d'invitation. */
export function SuperAdmins() {
  const { user } = useAuth();
  const { t } = useI18n();
  const elevated = useElevated();
  if (user?.role !== 'PLATFORM_OWNER') return <Navigate to="/" replace />;
  return (
    <>
      <header className="topbar">
        <Link className="icon-btn flat" to="/moi" aria-label={t('common.back')}>
          <Icon name="back" size={24} />
        </Link>
        <h1 className="title">{t('sa.title')}</h1>
      </header>
      <div className="page">
        <ElevationPrompt reason={t('sa.reason')} />
        <InvitationManager
          locked={!elevated}
          title={t('sa.invite')}
          createLabel={t('inv.createLink')}
          pseudoRequired
          intro={t('sa.intro')}
        />
      </div>
    </>
  );
}
