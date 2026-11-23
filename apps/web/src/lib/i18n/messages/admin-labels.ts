import { defineMessages } from './types';

/** Libellés des types de retours, de leurs états et des événements du journal de sécurité. */
export const adminLabels = defineMessages({
  'feedback.kind.IDEA': ['Idée', 'Idea', 'Idea'],
  'feedback.kind.IMPROVEMENT': ['Amélioration', 'Improvement', 'Mejora'],
  'feedback.kind.BUG': ['Bug', 'Bug', 'Error'],
  'feedback.kind.OTHER': ['Autre', 'Other', 'Otro'],
  'feedback.status.NEW': ['NOUVEAU', 'NEW', 'NUEVO'],
  'feedback.status.READ': ['LU', 'READ', 'LEÍDO'],
  'feedback.status.DONE': ['TRAITÉ', 'DONE', 'RESUELTO'],

  'security.event.LOGIN_OK': ['Connexion réussie', 'Signed in', 'Inicio de sesión correcto'],
  'security.event.LOGIN_FAILED': [
    'Mot de passe incorrect',
    'Wrong password',
    'Contraseña incorrecta',
  ],
  'security.event.MFA_FAILED': [
    'Code de double authentification incorrect',
    'Wrong two-factor code',
    'Código de verificación en dos pasos incorrecto',
  ],
  'security.event.ACCOUNT_LOCKED': [
    'Compte bloqué après trop d’essais',
    'Account locked after too many attempts',
    'Cuenta bloqueada tras demasiados intentos',
  ],
  'security.event.MFA_ENABLED': [
    'Double authentification activée',
    'Two-factor authentication enabled',
    'Verificación en dos pasos activada',
  ],
  'security.event.RECOVERY_USED': [
    'Code de secours utilisé',
    'Recovery code used',
    'Código de recuperación usado',
  ],
  'security.event.RECOVERY_REGENERATED': [
    'Nouveaux codes de secours générés',
    'New recovery codes generated',
    'Nuevos códigos de recuperación generados',
  ],
  'security.event.PASSWORD_CHANGED': [
    'Mot de passe changé',
    'Password changed',
    'Contraseña cambiada',
  ],
  'security.event.PASSWORD_RESET': [
    'Mot de passe changé avec un lien de réinitialisation',
    'Password changed with a reset link',
    'Contraseña cambiada con un enlace de restablecimiento',
  ],
  'security.event.RESET_LINK_ISSUED': [
    'Lien de réinitialisation émis pour ce compte',
    'Reset link issued for this account',
    'Enlace de restablecimiento emitido para esta cuenta',
  ],
  'security.event.SESSIONS_REVOKED': ['Sessions fermées', 'Sessions closed', 'Sesiones cerradas'],
  'security.event.CREATOR_INVITED': [
    'Super admin invité',
    'Super admin invited',
    'Superadmin invitado',
  ],
});
