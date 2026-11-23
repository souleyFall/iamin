import { defineMessages } from './types';

/** Mots et phrases qui reviennent sur plusieurs écrans. */
export const common = defineMessages({
  'common.loading': ['Chargement…', 'Loading…', 'Cargando…'],
  'common.back': ['Retour', 'Back', 'Volver'],
  'common.no': ['Non', 'No', 'No'],
  'common.cancel': ['Annuler', 'Cancel', 'Cancelar'],
  'common.delete': ['Supprimer', 'Delete', 'Eliminar'],
  'common.close': ['Fermer', 'Close', 'Cerrar'],
  'common.confirm': ['Confirmer', 'Confirm', 'Confirmar'],
  'common.send': ['Envoyer', 'Send', 'Enviar'],
  'common.copied': ['Copié', 'Copied', 'Copiado'],
  'common.disclaimer': [
    'i-am-in est un outil indépendant, non affilié à Plato.',
    'i-am-in is an independent tool, not affiliated with Plato.',
    'i-am-in es una herramienta independiente, sin afiliación con Plato.',
  ],
  'common.unknownUser': [
    'Un joueur ou un compte supprimé',
    'A player or a deleted account',
    'Un jugador o una cuenta eliminada',
  ],
  'common.language': ['Langue', 'Language', 'Idioma'],
  'common.logout': ['Se déconnecter', 'Log out', 'Cerrar sesión'],

  // Navigation
  'nav.label': ['Navigation', 'Navigation', 'Navegación'],
  'nav.tournaments': ['Tournois', 'Tournaments', 'Torneos'],
  'nav.group': ['Groupe', 'Group', 'Grupo'],
  'nav.me': ['Moi', 'Me', 'Yo'],
  'nav.security': ['Sécurité', 'Security', 'Seguridad'],
  'nav.superAdmins': ['Super admins', 'Super admins', 'Superadmins'],
  'nav.feedback': ['Retours', 'Feedback', 'Comentarios'],
  'nav.platform': ['Plateforme', 'Platform', 'Plataforma'],
  'nav.account': ['Compte', 'Account', 'Cuenta'],
  'role.owner': ['Propriétaire', 'Owner', 'Propietario'],
  'role.creator': ['Super admin', 'Super admin', 'Superadmin'],
  'role.admin': ['Admin', 'Admin', 'Admin'],
  'role.ownerTag': ['PROPRIÉTAIRE', 'OWNER', 'PROPIETARIO'],
  'role.creatorTag': ['SUPER ADMIN', 'SUPER ADMIN', 'SUPERADMIN'],
  'role.adminTag': ['ADMIN', 'ADMIN', 'ADMIN'],

  // Statuts et formats d'un tournoi
  'status.registration': ['INSCRIPTIONS', 'REGISTRATION', 'INSCRIPCIONES'],
  'status.checkIn': ['POINTAGE', 'CHECK-IN', 'ASISTENCIA'],
  'status.started': ['EN JEU', 'LIVE', 'EN JUEGO'],
  'status.finished': ['TERMINÉ', 'FINISHED', 'TERMINADO'],
  'format.elimination': ['Élimination directe', 'Single elimination', 'Eliminación directa'],
  'format.league': ['Ligue', 'League', 'Liga'],
  'presence.unknown': ['à pointer', 'to check in', 'por registrar'],
  'presence.present': ['présent', 'present', 'presente'],
  'presence.absent': ['absent', 'absent', 'ausente'],

  // Phrases construites à partir de nombres
  'counts.registered': [
    '{accepted} / {cap} inscrits',
    '{accepted} / {cap} registered',
    '{accepted} / {cap} inscritos',
  ],
  'counts.waitlist': [
    "{n} en liste d'attente",
    '{n} on the waiting list',
    '{n} en lista de espera',
  ],
  'counts.pending': [
    '{n} en attente de validation',
    '{n} awaiting approval',
    '{n} pendientes de validar',
  ],
  'members.count_one': ['{count} admin', '{count} admin', '{count} admin'],
  'members.count_other': ['{count} admins', '{count} admins', '{count} admins'],
});
