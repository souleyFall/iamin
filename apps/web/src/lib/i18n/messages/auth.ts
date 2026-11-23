import { defineMessages } from './types';

/** Connexion, invitations, super admins, groupes. */
export const auth = defineMessages({
  // Connexion
  'login.title': ['Connexion admin', 'Admin sign-in', 'Acceso de admin'],
  'login.username': ['Identifiant', 'Username', 'Identificador'],
  'login.password': ['Mot de passe', 'Password', 'Contraseña'],
  'login.submit': ['Se connecter', 'Sign in', 'Iniciar sesión'],
  'login.code': [
    'Code de l’application d’authentification',
    'Code from the authenticator app',
    'Código de la aplicación de autenticación',
  ],
  'login.codeHint': [
    '6 chiffres, ou un code de secours (xxxxx-xxxxx) si tu n’as plus ton téléphone.',
    '6 digits, or a recovery code (xxxxx-xxxxx) if you no longer have your phone.',
    '6 dígitos, o un código de recuperación (xxxxx-xxxxx) si ya no tienes el teléfono.',
  ],
  'login.restart': ['Recommencer', 'Start over', 'Empezar de nuevo'],
  'login.validate': ['Valider le code', 'Confirm the code', 'Validar el código'],
  'login.failed': ['Connexion impossible.', 'Could not sign in.', 'No se pudo iniciar sesión.'],

  // Page du lien d'invitation
  'invite.title': ['Invitation', 'Invitation', 'Invitación'],
  'invite.loggedIn': [
    'Tu es connecté en tant que {name}. Utiliser cette invitation avec ce compte ?',
    'You are signed in as {name}. Use this invitation with this account?',
    'Has iniciado sesión como {name}. ¿Usar esta invitación con esta cuenta?',
  ],
  'invite.use': ['Utiliser l’invitation', 'Use the invitation', 'Usar la invitación'],
  'invite.createTitle': ['Créer ton compte', 'Create your account', 'Crea tu cuenta'],
  'invite.createHint': [
    'Tu as reçu une invitation. Choisis un identifiant et un mot de passe (12 caractères au moins).',
    'You received an invitation. Choose a username and a password (at least 12 characters).',
    'Has recibido una invitación. Elige un identificador y una contraseña (al menos 12 caracteres).',
  ],
  'invite.plato': ['Pseudo Plato', 'Plato username', 'Usuario de Plato'],
  'invite.platoLocked': [
    'Ce lien est réservé à ce pseudo Plato : il ne se modifie pas.',
    'This link is reserved for this Plato username: it cannot be changed.',
    'Este enlace está reservado a este usuario de Plato: no se puede cambiar.',
  ],
  'invite.platoFree': [
    'Il sert à vérifier ton identité si tu perds ton mot de passe.',
    'It is used to verify your identity if you lose your password.',
    'Sirve para verificar tu identidad si pierdes la contraseña.',
  ],
  'invite.create': ['Créer mon compte', 'Create my account', 'Crear mi cuenta'],
  'invite.hasAccount': [
    'Tu as déjà un compte ? ',
    'Already have an account? ',
    '¿Ya tienes cuenta? ',
  ],
  'invite.signInLink': ['Connecte-toi', 'Sign in', 'Inicia sesión'],
  'invite.reopen': [
    ', puis rouvre ce lien.',
    ', then open this link again.',
    ' y vuelve a abrir este enlace.',
  ],
  'invite.failed': [
    'Invitation impossible.',
    'Could not use the invitation.',
    'No se pudo usar la invitación.',
  ],

  // Gestion des invitations
  'inv.pseudo': [
    'Pseudo Plato de la personne',
    'Plato username of the person',
    'Usuario de Plato de la persona',
  ],
  'inv.optional': [' (facultatif)', ' (optional)', ' (opcional)'],
  'inv.pseudoHint': [
    'Il sera imposé à la création du compte : seule cette personne peut utiliser le lien.',
    'It will be required when the account is created: only this person can use the link.',
    'Se exigirá al crear la cuenta: solo esa persona puede usar el enlace.',
  ],
  'inv.created': [
    'Lien créé. Copie-le maintenant : il ne s’affichera plus. Il sert une seule fois et expire dans {days}.',
    'Link created. Copy it now: it will not be shown again. It works once and expires in {days}.',
    'Enlace creado. Cópialo ahora: no se mostrará de nuevo. Sirve una sola vez y caduca en {days}.',
  ],
  'inv.days_one': ['{count} jour', '{count} day', '{count} día'],
  'inv.days_other': ['{count} jours', '{count} days', '{count} días'],
  'inv.copy': ['Copier le lien', 'Copy the link', 'Copiar el enlace'],
  'inv.copied': ['Lien copié.', 'Link copied.', 'Enlace copiado.'],
  'inv.copyRefused': [
    'Copie refusée par le navigateur : sélectionne le lien ci-dessus.',
    'The browser refused the copy: select the link above.',
    'El navegador rechazó la copia: selecciona el enlace de arriba.',
  ],
  'inv.pending': ['En attente · {n}', 'Pending · {n}', 'Pendientes · {n}'],
  'inv.freePseudo': ['Pseudo libre', 'Any username', 'Usuario libre'],
  'inv.expires': ['Expire dans {days}', 'Expires in {days}', 'Caduca en {days}'],
  'inv.cancelLink': ['Annuler le lien', 'Cancel the link', 'Cancelar el enlace'],
  'inv.createLink': [
    'Créer un lien d’invitation',
    'Create an invitation link',
    'Crear un enlace de invitación',
  ],

  // Super admins
  'sa.title': ['Super admins', 'Super admins', 'Superadmins'],
  'sa.invite': ['Inviter un super admin', 'Invite a super admin', 'Invitar a un superadmin'],
  'sa.intro': [
    'Un super admin crée ses propres groupes, puis y invite ses admins. Toi, tu ne fais que le valider : tu ne vois pas le contenu de ses groupes.',
    'A super admin creates their own groups, then invites their admins. You only approve them: you do not see what is in their groups.',
    'Un superadmin crea sus propios grupos y luego invita a sus admins. Tú solo lo validas: no ves el contenido de sus grupos.',
  ],
  'sa.reason': [
    'Inviter ou annuler l’invitation d’un super admin demande ton code : une session volée ne suffirait pas.',
    'Inviting or canceling a super admin invitation asks for your code: a stolen session would not be enough.',
    'Invitar o cancelar la invitación de un superadmin pide tu código: una sesión robada no bastaría.',
  ],

  // Groupe
  'group.title': ['Groupe', 'Group', 'Grupo'],
  'group.none': ['Aucun groupe.', 'No group.', 'Ningún grupo.'],
  'group.creatorNone': [
    'Tu n’as pas encore de groupe.',
    'You do not have a group yet.',
    'Todavía no tienes grupo.',
  ],
  'group.inviteTitle': ['Inviter un admin', 'Invite an admin', 'Invitar a un admin'],
  'group.inviteIntro': [
    'Un admin gère les tournois du groupe. Envoie-lui le lien : il crée son compte, ou rejoint le groupe s’il en a déjà un.',
    'An admin manages the group’s tournaments. Send them the link: they create their account, or join the group if they already have one.',
    'Un admin gestiona los torneos del grupo. Envíale el enlace: crea su cuenta, o se une al grupo si ya tiene una.',
  ],
  'group.create': ['Créer un groupe', 'Create a group', 'Crear un grupo'],
  'group.newTitle': ['Nouveau groupe', 'New group', 'Nuevo grupo'],
  'group.name': ['Nom du groupe', 'Group name', 'Nombre del grupo'],
  'group.namePlaceholder': ['Ex. Les Stratèges', 'E.g. The Strategists', 'Ej. Los Estrategas'],
  'group.submit': ['Créer le groupe', 'Create the group', 'Crear el grupo'],
  'group.superHint': [
    'Tu en seras le super admin : tu pourras inviter les admins qui géreront les tournois.',
    'You will be its super admin: you can invite the admins who manage the tournaments.',
    'Serás su superadmin: podrás invitar a los admins que gestionarán los torneos.',
  ],
});
