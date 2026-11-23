import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/session';
import { Icon } from '../components/Icon';
import { InvitationManager } from '../components/InvitationManager';

/** Le propriétaire de la plateforme valide les super admins en leur envoyant un lien d'invitation. */
export function SuperAdmins() {
  const { user } = useAuth();
  if (user?.role !== 'PLATFORM_OWNER') return <Navigate to="/" replace />;
  return (
    <>
      <header className="topbar">
        <Link className="icon-btn flat" to="/moi" aria-label="Retour">
          <Icon name="back" size={24} />
        </Link>
        <h1 className="title">Super admins</h1>
      </header>
      <div className="page">
        <InvitationManager
          title="Inviter un super admin"
          createLabel="Créer un lien d’invitation"
          pseudoRequired
          intro="Un super admin crée ses propres groupes, puis y invite ses admins. Toi, tu ne fais que le valider : tu ne vois pas le contenu de ses groupes."
        />
      </div>
    </>
  );
}
