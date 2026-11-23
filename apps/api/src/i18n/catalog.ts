/**
 * Messages que l'API renvoie à l'utilisateur, en français (langue d'origine du code), anglais et
 * espagnol. Chaque ligne : `[français, anglais, espagnol]`. Le français est le texte exact levé dans
 * le code ; `{nom}` marque une valeur variable, reprise telle quelle dans les trois langues.
 *
 * Un test (`i18n.test.ts`) lit le code de l'API et du moteur : un message ajouté sans sa ligne ici
 * fait échouer la CI. Ajouter une langue : une colonne par ligne, puis `LOCALES` dans `translate.ts`.
 */
export type Entry = readonly [fr: string, en: string, es: string];

export const CATALOG: readonly Entry[] = [
  // ---- Session, droits, protections
  ['Connexion requise', 'Sign-in required', 'Se requiere iniciar sesión'],
  ['Origine non autorisée', 'Origin not allowed', 'Origen no autorizado'],
  [
    'Jeton CSRF manquant ou invalide',
    'Missing or invalid CSRF token',
    'Token CSRF ausente o no válido',
  ],
  ['Accès refusé', 'Access denied', 'Acceso denegado'],
  [
    'Active la double authentification pour continuer',
    'Enable two-factor authentication to continue',
    'Activa la verificación en dos pasos para continuar',
  ],
  [
    'Confirme avec ton code à 6 chiffres pour continuer',
    'Confirm with your 6-digit code to continue',
    'Confirma con tu código de 6 dígitos para continuar',
  ],
  [
    'Trop de tentatives. Réessaie dans quelques minutes.',
    'Too many attempts. Try again in a few minutes.',
    'Demasiados intentos. Vuelve a intentarlo en unos minutos.',
  ],
  [
    'Trop de codes incorrects. Réessaie dans quelques minutes.',
    'Too many wrong codes. Try again in a few minutes.',
    'Demasiados códigos incorrectos. Vuelve a intentarlo en unos minutos.',
  ],

  // ---- Connexion et mot de passe
  [
    'Identifiant ou mot de passe incorrect',
    'Wrong username or password',
    'Identificador o contraseña incorrectos',
  ],
  [
    'Connexion expirée, recommence avec ton mot de passe',
    'Sign-in expired, start again with your password',
    'Inicio de sesión caducado, empieza de nuevo con tu contraseña',
  ],
  ['Code incorrect', 'Wrong code', 'Código incorrecto'],
  ['Mot de passe incorrect', 'Wrong password', 'Contraseña incorrecta'],
  [
    'Mot de passe actuel incorrect',
    'Current password is wrong',
    'La contraseña actual es incorrecta',
  ],
  ['Données invalides', 'Invalid data', 'Datos no válidos'],
  ['Erreur interne du serveur', 'Internal server error', 'Error interno del servidor'],
  ['Session introuvable', 'Session not found', 'Sesión no encontrada'],
  [
    'Lien de réinitialisation invalide ou expiré',
    'Reset link invalid or expired',
    'Enlace de restablecimiento no válido o caducado',
  ],
  ['Ticket introuvable', 'Ticket not found', 'Ticket no encontrado'],
  ['Ce ticket est déjà clos', 'This ticket is already closed', 'Este ticket ya está cerrado'],

  // ---- Double authentification
  [
    'La double authentification est déjà active',
    'Two-factor authentication is already enabled',
    'La verificación en dos pasos ya está activada',
  ],
  [
    'La double authentification n’est pas active',
    'Two-factor authentication is not enabled',
    'La verificación en dos pasos no está activada',
  ],
  ['Commence par générer un secret', 'Generate a secret first', 'Empieza generando un secreto'],
  [
    'Le propriétaire ne peut pas désactiver la double authentification',
    'The owner cannot disable two-factor authentication',
    'El propietario no puede desactivar la verificación en dos pasos',
  ],

  // ---- Invitations
  ['Invitation introuvable', 'Invitation not found', 'Invitación no encontrada'],
  [
    'Invitation invalide ou expirée',
    'Invitation invalid or expired',
    'Invitación no válida o caducada',
  ],
  [
    'Le pseudo Plato doit être celui de l’invitation',
    'The Plato username must be the one of the invitation',
    'El usuario de Plato debe ser el de la invitación',
  ],
  [
    'Cette invitation est destinée à un autre pseudo Plato',
    'This invitation is meant for another Plato username',
    'Esta invitación es para otro usuario de Plato',
  ],
  [
    'Cet identifiant est déjà pris',
    'This username is already taken',
    'Este identificador ya está en uso',
  ],
  ['Tu peux déjà créer des groupes', 'You can already create groups', 'Ya puedes crear grupos'],
  [
    'Tu fais déjà partie de ce groupe',
    'You are already in this group',
    'Ya formas parte de este grupo',
  ],

  // ---- Groupes
  ['Groupe introuvable', 'Group not found', 'Grupo no encontrado'],
  ['Membre introuvable', 'Member not found', 'Miembro no encontrado'],
  [
    'Tu as atteint la limite de {n} groupes par super admin',
    'You have reached the limit of {n} groups per super admin',
    'Has alcanzado el límite de {n} grupos por superadmin',
  ],
  [
    'Seul le propriétaire de la plateforme invite un super admin',
    'Only the platform owner can invite a super admin',
    'Solo el propietario de la plataforma invita a un superadmin',
  ],
  [
    'Un super admin ne peut pas être retiré du groupe',
    'A super admin cannot be removed from the group',
    'Un superadmin no se puede retirar del grupo',
  ],

  // ---- Retours des utilisateurs
  ['Retour introuvable', 'Feedback not found', 'Comentario no encontrado'],
  [
    'La boîte de retours est pleine pour le moment, réessaie plus tard.',
    'The feedback box is full right now, try again later.',
    'El buzón de comentarios está lleno ahora mismo, vuelve a intentarlo más tarde.',
  ],

  // ---- Tournois
  ['Tournoi introuvable', 'Tournament not found', 'Torneo no encontrado'],
  ['Inscription introuvable', 'Registration not found', 'Inscripción no encontrada'],
  ['Match introuvable', 'Match not found', 'Partido no encontrado'],
  ['Curseur inconnu', 'Unknown cursor', 'Cursor desconocido'],
  ['Aucune modification', 'No change', 'Ninguna modificación'],
  ['Code de match invalide', 'Invalid match code', 'Código de partido no válido'],
  ['Trop de connexions en direct', 'Too many live connections', 'Demasiadas conexiones en directo'],
  [
    'Le tirage est fait : les places et la phase sont figées',
    'The draw is done: places and phase are frozen',
    'El sorteo está hecho: las plazas y la fase están cerradas',
  ],
  [
    'Impossible : {n} joueurs sont déjà acceptés. Retirez-en avant de réduire les places.',
    'Not possible: {n} players are already accepted. Remove some before reducing the places.',
    'Imposible: ya hay {n} jugadores aceptados. Retira alguno antes de reducir las plazas.',
  ],
  [
    'Une ligue accepte {n} joueurs au plus',
    'A league accepts {n} players at most',
    'Una liga acepta {n} jugadores como máximo',
  ],
  [
    'Cette inscription est déjà validée',
    'This registration is already approved',
    'Esta inscripción ya está validada',
  ],
  ['Le pointage n’est pas ouvert', 'Check-in is not open', 'La asistencia no está abierta'],
  [
    'Seuls les joueurs acceptés se pointent',
    'Only accepted players check in',
    'Solo los jugadores aceptados registran asistencia',
  ],
  ['Les inscriptions sont closes', 'Registration is closed', 'Las inscripciones están cerradas'],
  [
    'Trop d’inscriptions en attente, réessayez plus tard',
    'Too many registrations waiting, try again later',
    'Demasiadas inscripciones pendientes, vuelve a intentarlo más tarde',
  ],
  [
    'Ce pseudo est déjà inscrit à ce tournoi',
    'This username is already registered in this tournament',
    'Este usuario ya está inscrito en este torneo',
  ],
  [
    'Utilisez le remplacement pour changer un joueur',
    'Use replacement to change a player',
    'Usa la sustitución para cambiar a un jugador',
  ],
  [
    'Le tirage est fait : prévenez un admin pour vous retirer',
    'The draw is done: ask an admin to remove you',
    'El sorteo está hecho: avisa a un admin para que te retire',
  ],

  // ---- Tirage, scores, remplacements
  ['Le tirage n’est pas fait', 'The draw has not been done', 'El sorteo no está hecho'],
  [
    'Il faut au moins 2 joueurs présents pour tirer au sort',
    'At least 2 players must be present to draw',
    'Hacen falta al menos 2 jugadores presentes para sortear',
  ],
  [
    'Ce score a changé depuis : rechargez la page',
    'This score has changed since: reload the page',
    'Este marcador ha cambiado desde entonces: recarga la página',
  ],
  ['Aucun score à annuler', 'No score to delete', 'Ningún marcador que eliminar'],
  [
    'Le match suivant a déjà un score : corrigez-le d’abord (le vainqueur de ce match change)',
    'The next match already has a score: fix it first (the winner of this match changes)',
    'El partido siguiente ya tiene marcador: corrígelo primero (el ganador de este partido cambia)',
  ],
  [
    'Le tournoi est terminé : plus de remplacement possible',
    'The tournament is over: no more replacements',
    'El torneo ha terminado: ya no se puede sustituir',
  ],
  [
    'Joueur à remplacer introuvable',
    'Player to replace not found',
    'Jugador a sustituir no encontrado',
  ],
  [
    'Joueur remplaçant introuvable',
    'Substitute player not found',
    'Jugador sustituto no encontrado',
  ],
  ['Choisissez un autre joueur', 'Choose another player', 'Elige otro jugador'],
  [
    'Ce joueur est déjà dans le tirage',
    'This player is already in the draw',
    'Este jugador ya está en el sorteo',
  ],
  [
    'Ce joueur a déjà joué : impossible de le remplacer',
    'This player has already played: cannot be replaced',
    'Este jugador ya ha jugado: no se puede sustituir',
  ],

  // ---- La main (relais)
  ['Vous tenez déjà la main', 'You already have control', 'Ya tienes el control'],
  [
    'Un autre admin tient la main : demandez-lui le relais',
    'Another admin has control: ask them for the handover',
    'Otro admin tiene el control: pídele el relevo',
  ],
  ['Choisissez un autre admin', 'Choose another admin', 'Elige otro admin'],
  [
    'Admin introuvable dans ce groupe',
    'Admin not found in this group',
    'Admin no encontrado en este grupo',
  ],
  ['Aucune proposition en cours', 'No offer in progress', 'Ninguna propuesta en curso'],
  [
    'Aucune proposition de relais pour vous',
    'No handover offer for you',
    'Ninguna propuesta de relevo para ti',
  ],

  // ---- Champs de formulaire (validation)
  [
    '3 à 32 caractères : lettres, chiffres, point, tiret ou souligné',
    '3 to 32 characters: letters, digits, dot, hyphen or underscore',
    'De 3 a 32 caracteres: letras, cifras, punto, guion o guion bajo',
  ],
  ['12 caractères au minimum', 'At least 12 characters', 'Al menos 12 caracteres'],
  ['128 caractères au maximum', 'At most 128 characters', 'Como máximo 128 caracteres'],
  [
    'Le pseudo Plato est obligatoire',
    'The Plato username is required',
    'El usuario de Plato es obligatorio',
  ],
  ['64 caractères au maximum', 'At most 64 characters', 'Como máximo 64 caracteres'],
  ['Caractères non autorisés', 'Characters not allowed', 'Caracteres no permitidos'],
  ['2 caractères au minimum', 'At least 2 characters', 'Al menos 2 caracteres'],
  ['60 caractères au maximum', 'At most 60 characters', 'Como máximo 60 caracteres'],
  ['80 caractères au maximum', 'At most 80 characters', 'Como máximo 80 caracteres'],
  ['5 caractères au moins', 'At least 5 characters', 'Al menos 5 caracteres'],
  ['2 000 caractères au maximum', 'At most 2,000 characters', 'Como máximo 2000 caracteres'],

  // ---- Moteur (tirage et scores)
  [
    'La taille du tableau doit être une puissance de deux, au moins 2.',
    'The bracket size must be a power of two, at least 2.',
    'El tamaño del cuadro debe ser una potencia de dos, como mínimo 2.',
  ],
  [
    'La graine du tirage est obligatoire.',
    'The draw seed is required.',
    'La semilla del sorteo es obligatoria.',
  ],
  [
    'Il faut au moins 2 joueurs.',
    'At least 2 players are needed.',
    'Hacen falta al menos 2 jugadores.',
  ],
  [
    'Un joueur apparaît plusieurs fois dans la liste.',
    'A player appears several times in the list.',
    'Un jugador aparece varias veces en la lista.',
  ],
  [
    'Score invalide pour {id} : des entiers positifs sont attendus.',
    'Invalid score for {id}: positive integers are expected.',
    'Marcador no válido para {id}: se esperan enteros positivos.',
  ],
  [
    'Score invalide pour {id} : un match ne peut pas finir à égalité.',
    'Invalid score for {id}: a match cannot end in a tie.',
    'Marcador no válido para {id}: un partido no puede terminar en empate.',
  ],
  [
    'Résultat pour un match inconnu : {id}.',
    'Result for an unknown match: {id}.',
    'Resultado de un partido desconocido: {id}.',
  ],
  [
    "{id} est un bye : aucun score n'est possible.",
    '{id} is a bye: no score is possible.',
    '{id} es un pase directo: no es posible ningún marcador.',
  ],
  [
    "{id} n'a pas encore ses deux joueurs : score refusé.",
    '{id} does not have its two players yet: score refused.',
    '{id} aún no tiene sus dos jugadores: marcador rechazado.',
  ],
  ['Joueur inconnu dans {id}.', 'Unknown player in {id}.', 'Jugador desconocido en {id}.'],
];

/**
 * Textes que d'autres bibliothèques écrivent en anglais : on les ramène à une phrase du catalogue
 * pour qu'ils suivent la langue de la personne.
 */
export const ALIASES: Readonly<Record<string, string>> = {
  'ThrottlerException: Too Many Requests': 'Trop de tentatives. Réessaie dans quelques minutes.',
};
