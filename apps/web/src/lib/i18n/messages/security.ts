import { defineMessages } from './types';

/** Écran Sécurité : double authentification, sessions, activité, ressaisie du code. */
export const security = defineMessages({
  'sec.title': ['Sécurité', 'Security', 'Seguridad'],
  'sec.code6': ['Code à 6 chiffres', '6-digit code', 'Código de 6 dígitos'],
  'sec.mustEnable': [
    'La double authentification est obligatoire pour le propriétaire de la plateforme. Active-la pour continuer.',
    'Two-factor authentication is mandatory for the platform owner. Enable it to continue.',
    'La verificación en dos pasos es obligatoria para el propietario de la plataforma. Actívala para continuar.',
  ],

  // Codes de secours
  'sec.recovery.title': ['Codes de secours', 'Recovery codes', 'Códigos de recuperación'],
  'sec.recovery.warn': [
    'Ils ne s’afficheront plus. Chacun sert une seule fois si tu perds ton téléphone. Garde-les dans un gestionnaire de mots de passe ou sur papier, pas sur le téléphone.',
    'They will not be shown again. Each works only once if you lose your phone. Keep them in a password manager or on paper, not on the phone.',
    'No se volverán a mostrar. Cada uno sirve una sola vez si pierdes el teléfono. Guárdalos en un gestor de contraseñas o en papel, no en el teléfono.',
  ],
  'sec.recovery.copy': ['Copier les codes', 'Copy the codes', 'Copiar los códigos'],
  'sec.recovery.copied': ['Codes copiés.', 'Codes copied.', 'Códigos copiados.'],
  'sec.recovery.refused': [
    'Copie refusée : recopie-les à la main.',
    'Copy refused: write them down by hand.',
    'Copia rechazada: cópialos a mano.',
  ],
  'sec.recovery.saved': [
    'J’ai gardé mes codes de secours',
    'I have saved my recovery codes',
    'He guardado mis códigos de recuperación',
  ],
  'sec.recovery.done': ['Terminer', 'Finish', 'Terminar'],

  // Activation
  'sec.enable.title': [
    'Activer la double authentification',
    'Enable two-factor authentication',
    'Activar la verificación en dos pasos',
  ],
  'sec.enable.intro': [
    'À chaque connexion, en plus du mot de passe, tu donneras un code à 6 chiffres qui change toutes les 30 secondes. Il faut une application d’authentification sur ton téléphone : Microsoft Authenticator, Google Authenticator, Aegis ou 2FAS.',
    'At every sign-in, besides your password, you will enter a 6-digit code that changes every 30 seconds. You need an authenticator app on your phone: Microsoft Authenticator, Google Authenticator, Aegis or 2FAS.',
    'En cada inicio de sesión, además de la contraseña, introducirás un código de 6 dígitos que cambia cada 30 segundos. Necesitas una aplicación de autenticación en tu teléfono: Microsoft Authenticator, Google Authenticator, Aegis o 2FAS.',
  ],
  'sec.enable.start': ['Commencer', 'Start', 'Empezar'],
  'sec.enable.step1': ['1. Scanne le QR code', '1. Scan the QR code', '1. Escanea el código QR'],
  'sec.enable.step1Hint': [
    'Dans l’application : « Ajouter un compte », puis « Scanner un code QR ».',
    'In the app: “Add account”, then “Scan a QR code”.',
    'En la aplicación: «Añadir cuenta» y luego «Escanear un código QR».',
  ],
  'sec.enable.qrLabel': [
    'QR code à scanner avec l’application d’authentification',
    'QR code to scan with the authenticator app',
    'Código QR para escanear con la aplicación de autenticación',
  ],
  'sec.enable.noScan': [
    'Le QR code ne se scanne pas ?',
    'The QR code does not scan?',
    '¿El código QR no se escanea?',
  ],
  'sec.enable.manualKey': [
    'Saisis cette clé à la main (type « basé sur l’heure ») :',
    'Type this key by hand (“time-based” type):',
    'Introduce esta clave a mano (tipo «basado en el tiempo»):',
  ],
  'sec.enable.step2': [
    '2. Donne le premier code',
    '2. Enter the first code',
    '2. Introduce el primer código',
  ],
  'sec.enable.submit': ['Activer', 'Enable', 'Activar'],

  // Déjà active
  'sec.active.title': [
    'Double authentification',
    'Two-factor authentication',
    'Verificación en dos pasos',
  ],
  'sec.active.on': ['ACTIVE', 'ON', 'ACTIVA'],
  'sec.active.left_one': [
    '{count} code de secours restant',
    '{count} recovery code left',
    '{count} código de recuperación restante',
  ],
  'sec.active.left_other': [
    '{count} codes de secours restants',
    '{count} recovery codes left',
    '{count} códigos de recuperación restantes',
  ],
  'sec.active.low': [
    'Il t’en reste peu : génère de nouveaux codes de secours.',
    'You are running low: generate new recovery codes.',
    'Te quedan pocos: genera nuevos códigos de recuperación.',
  ],
  'sec.active.codeHint': [
    'Demandé pour les deux actions ci-dessous.',
    'Required for both actions below.',
    'Se pide para las dos acciones de abajo.',
  ],
  'sec.active.regenerate': [
    'Générer de nouveaux codes de secours',
    'Generate new recovery codes',
    'Generar nuevos códigos de recuperación',
  ],
  'sec.active.required': [
    'La double authentification est obligatoire pour ton compte : elle ne se désactive pas ici.',
    'Two-factor authentication is mandatory for your account: it cannot be disabled here.',
    'La verificación en dos pasos es obligatoria para tu cuenta: no se desactiva aquí.',
  ],
  'sec.active.passwordLabel': [
    'Mot de passe (pour désactiver)',
    'Password (to disable)',
    'Contraseña (para desactivar)',
  ],
  'sec.active.disable': ['Désactiver', 'Disable', 'Desactivar'],
  'sec.active.disableButton': [
    'Désactiver la double authentification',
    'Disable two-factor authentication',
    'Desactivar la verificación en dos pasos',
  ],

  // Sessions et activité
  'sec.sessions.title': ['Sessions ouvertes', 'Open sessions', 'Sesiones abiertas'],
  'sec.sessions.hint': [
    'Une session que tu ne reconnais pas ? Ferme-la, puis change ton mot de passe.',
    'A session you do not recognize? Close it, then change your password.',
    '¿Una sesión que no reconoces? Ciérrala y cambia tu contraseña.',
  ],
  'sec.sessions.unknownDevice': ['Appareil inconnu', 'Unknown device', 'Dispositivo desconocido'],
  'sec.sessions.current': ['CETTE SESSION', 'THIS SESSION', 'ESTA SESIÓN'],
  'sec.sessions.times': [
    'Active {last} · ouverte {created}',
    'Active {last} · opened {created}',
    'Activa {last} · abierta {created}',
  ],
  'sec.sessions.close': ['Fermer', 'Close', 'Cerrar'],
  'sec.sessions.closeConfirm': ['Fermer la session', 'Close the session', 'Cerrar la sesión'],
  'sec.sessions.closeOthers': [
    'Fermer toutes les autres sessions',
    'Close all other sessions',
    'Cerrar todas las demás sesiones',
  ],
  'sec.sessions.closeOthersConfirm': [
    'Fermer toutes les autres',
    'Close all others',
    'Cerrar todas las demás',
  ],
  'sec.activity.title': ['Activité récente', 'Recent activity', 'Actividad reciente'],
  'sec.activity.hint': [
    'Les 30 derniers jours. Ni adresse IP ni détail de ton navigateur : seulement le type d’appareil.',
    'The last 30 days. No IP address and no browser details: only the type of device.',
    'Los últimos 30 días. Ni dirección IP ni detalles del navegador: solo el tipo de dispositivo.',
  ],
  'sec.activity.none': ['Rien à signaler.', 'Nothing to report.', 'Nada que señalar.'],
  'sec.activity.check': ['À VÉRIFIER', 'CHECK THIS', 'REVISAR'],

  // Ressaisie du code
  'elev.title': ['Confirme avec ton code', 'Confirm with your code', 'Confirma con tu código'],
  'elev.aria': ['Confirmer avec ton code', 'Confirm with your code', 'Confirmar con tu código'],
});
