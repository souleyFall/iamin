import { defineMessages } from './types';

/** Liste des tournois, création, inscrits, pointage, tirage, matchs, relais. */
export const tournaments = defineMessages({
  // Liste
  'list.relay.finished': ['Terminé', 'Finished', 'Terminado'],
  'list.relay.you': ['Tu as la main', 'You have control', 'Tienes el control'],
  'list.relay.other': ['Main : {name}', 'Control: {name}', 'Control: {name}'],
  'list.relay.nobody': ['Personne n’a la main', 'Nobody has control', 'Nadie tiene el control'],
  'list.group': ['Groupe', 'Group', 'Grupo'],
  'list.title': ['Mes tournois', 'My tournaments', 'Mis torneos'],
  'list.empty': [
    'Aucun tournoi pour l’instant. Crée le premier ci-dessous.',
    'No tournament yet. Create the first one below.',
    'Todavía no hay torneos. Crea el primero abajo.',
  ],
  'list.new': ['Nouveau tournoi', 'New tournament', 'Nuevo torneo'],
  'list.createGroup': ['Créer un groupe', 'Create a group', 'Crear un grupo'],
  'list.creatorHint': [
    'Tu es super admin : crée ton premier groupe pour commencer.',
    'You are a super admin: create your first group to get started.',
    'Eres superadmin: crea tu primer grupo para empezar.',
  ],
  'list.ownerHint': [
    'Aucun groupe pour l’instant. Invite un super admin depuis l’onglet Moi : c’est lui qui crée les groupes.',
    'No group yet. Invite a super admin from the Me tab: they create the groups.',
    'Todavía no hay grupos. Invita a un superadmin desde la pestaña Yo: él crea los grupos.',
  ],
  'list.memberHint': [
    'Tu n’es membre d’aucun groupe. Demande une invitation à un super admin de ton groupe.',
    'You are not a member of any group. Ask a super admin of your group for an invitation.',
    'No eres miembro de ningún grupo. Pide una invitación a un superadmin de tu grupo.',
  ],
  'list.ownerNoAccess': [
    'Le propriétaire de la plateforme n’accède pas aux tournois des groupes : connecte-toi avec un compte admin de groupe.',
    'The platform owner cannot access group tournaments: sign in with a group admin account.',
    'El propietario de la plataforma no accede a los torneos de los grupos: inicia sesión con una cuenta de admin de grupo.',
  ],

  // Création
  'new.title': ['Nouveau tournoi', 'New tournament', 'Nuevo torneo'],
  'new.name': ['Nom du tournoi', 'Tournament name', 'Nombre del torneo'],
  'new.namePlaceholder': ['Ex. Échecs #13', 'E.g. Chess #13', 'Ej. Ajedrez n.º 13'],
  'new.format': ['Format', 'Format', 'Formato'],
  'new.leagueHint': [
    'Chacun joue contre chacun : 32 joueurs au plus.',
    'Everyone plays everyone: 32 players at most.',
    'Todos juegan contra todos: 32 jugadores como máximo.',
  ],
  'new.eliminationHint': [
    'Le perdant est éliminé. Les byes vont à des joueurs tirés au sort.',
    'The loser is out. Byes go to randomly drawn players.',
    'El perdedor queda eliminado. Los pases directos van a jugadores sorteados.',
  ],
  'new.capacity': ['Nombre de places', 'Number of places', 'Número de plazas'],
  'new.capacityHint': [
    'Au-delà, les inscrits validés vont en liste d’attente.',
    'Beyond that, approved players go on the waiting list.',
    'Más allá, los inscritos validados pasan a la lista de espera.',
  ],
  'new.submit': ['Créer le tournoi', 'Create the tournament', 'Crear el torneo'],
  'new.holderHint': [
    'Tu en auras la main : tu pourras la passer à un autre admin du groupe.',
    'You will have control of it: you can hand it over to another admin of the group.',
    'Tendrás el control: podrás pasarlo a otro admin del grupo.',
  ],

  // Inscrits
  'reg.shareTitle': ['Lien pour les joueurs', 'Link for players', 'Enlace para los jugadores'],
  'reg.copyLink': ['Copier le lien', 'Copy the link', 'Copiar el enlace'],
  'reg.linkCopied': ['Lien copié.', 'Link copied.', 'Enlace copiado.'],
  'reg.copyRefused': [
    'Copie refusée par le navigateur : sélectionne le lien ci-dessus.',
    'The browser refused the copy: select the link above.',
    'El navegador rechazó la copia: selecciona el enlace de arriba.',
  ],
  'reg.frozen': [
    'Le tirage est fait : la liste des joueurs est figée.',
    'The draw is done: the player list is frozen.',
    'El sorteo está hecho: la lista de jugadores está cerrada.',
  ],
  'reg.pendingTitle': ['À valider · {n}', 'To approve · {n}', 'Por validar · {n}'],
  'reg.pendingNone': [
    'Aucune inscription en attente.',
    'No registration waiting.',
    'Ninguna inscripción pendiente.',
  ],
  'reg.approve': ['Valider', 'Approve', 'Validar'],
  'reg.approveAria': ['Valider {name}', 'Approve {name}', 'Validar a {name}'],
  'reg.refuse': ['Refuser', 'Decline', 'Rechazar'],
  'reg.comparePlato': [
    'Compare le pseudo avec Plato avant de valider : c’est ta seule vérification.',
    'Compare the username with Plato before approving: it is your only check.',
    'Compara el usuario con Plato antes de validar: es tu única comprobación.',
  ],
  'reg.acceptedTitle': [
    'Inscrits · {n} / {cap}',
    'Registered · {n} / {cap}',
    'Inscritos · {n} / {cap}',
  ],
  'reg.remove': ['Retirer', 'Remove', 'Retirar'],
  'reg.waitlistTitle': ['Liste d’attente · {n}', 'Waiting list · {n}', 'Lista de espera · {n}'],
  'reg.waitlistHint': [
    'Le premier passe inscrit dès qu’une place se libère.',
    'The first one is registered as soon as a place frees up.',
    'El primero pasa a inscrito en cuanto se libera una plaza.',
  ],
  'reg.addTitle': ['Ajouter un joueur', 'Add a player', 'Añadir un jugador'],
  'reg.addPlaceholder': ['Pseudo Plato', 'Plato username', 'Usuario de Plato'],
  'reg.add': ['Ajouter', 'Add', 'Añadir'],

  // Pointage
  'check.counters': ['Compteurs du pointage', 'Check-in counters', 'Contadores de asistencia'],
  'check.present_one': ['présent', 'present', 'presente'],
  'check.present_other': ['présents', 'present', 'presentes'],
  'check.absent_one': ['absent', 'absent', 'ausente'],
  'check.absent_other': ['absents', 'absent', 'ausentes'],
  'check.toCheck': ['à pointer', 'to check in', 'por registrar'],
  'check.openHint': [
    'Les inscriptions sont ouvertes. Ouvre le pointage quand les joueurs arrivent.',
    'Registration is open. Open check-in when players arrive.',
    'Las inscripciones están abiertas. Abre la asistencia cuando lleguen los jugadores.',
  ],
  'check.open': ['Ouvrir le pointage', 'Open check-in', 'Abrir la asistencia'],
  'check.none': [
    'Aucun inscrit à pointer pour l’instant.',
    'No registered player to check in yet.',
    'Todavía no hay inscritos que registrar.',
  ],
  'check.presenceOf': ['Présence de {name}', 'Attendance of {name}', 'Asistencia de {name}'],
  'check.present': ['Présent', 'Present', 'Presente'],
  'check.absentAria': ['Absent', 'Absent', 'Ausente'],
  'check.drawHint': [
    'Le tirage se fait uniquement avec les joueurs présents.',
    'The draw only uses the players who are present.',
    'El sorteo se hace solo con los jugadores presentes.',
  ],
  'check.validate_one': [
    'Valider le {count} présent',
    'Confirm the {count} present player',
    'Validar el {count} presente',
  ],
  'check.validate_other': [
    'Valider les {count} présents',
    'Confirm the {count} present players',
    'Validar los {count} presentes',
  ],

  // Tirage
  'draw.doneTitle': ['Tirage effectué', 'Draw done', 'Sorteo realizado'],
  'draw.verifiable': [
    'Le tirage est vérifiable : avec la même liste et la même graine, n’importe qui retrouve ce résultat.',
    'The draw is verifiable: with the same list and the same seed, anyone gets this result.',
    'El sorteo es verificable: con la misma lista y la misma semilla, cualquiera obtiene este resultado.',
  ],
  'draw.seed': ['Graine', 'Seed', 'Semilla'],
  'draw.bracketLine': [
    '{players} joueurs, tableau de {size} : ',
    '{players} players, bracket of {size}: ',
    '{players} jugadores, cuadro de {size}: ',
  ],
  'draw.byes_one': ['{count} bye', '{count} bye', '{count} pase directo'],
  'draw.byes_other': ['{count} byes', '{count} byes', '{count} pases directos'],
  'draw.byesTail': [
    ' (des joueurs tirés au sort passent le premier tour).',
    ' (randomly drawn players skip the first round).',
    ' (jugadores sorteados pasan la primera ronda).',
  ],
  'draw.order': ['Ordre du tirage', 'Draw order', 'Orden del sorteo'],
  'draw.title': ['Tirage au sort', 'Draw', 'Sorteo'],
  'draw.presentCount_one': [
    '{count} joueur présent.',
    '{count} player present.',
    '{count} jugador presente.',
  ],
  'draw.presentCount_other': [
    '{count} joueurs présents.',
    '{count} players present.',
    '{count} jugadores presentes.',
  ],
  'draw.bracketSize': ['Tableau de {size}', 'Bracket of {size}', 'Cuadro de {size}'],
  'draw.withByes_one': [
    ' : {count} bye. Les byes vont à des joueurs tirés au sort, jamais deux dans le même match.',
    ': {count} bye. Byes go to randomly drawn players, never two in the same match.',
    ': {count} pase directo. Los pases van a jugadores sorteados, nunca dos en el mismo partido.',
  ],
  'draw.withByes_other': [
    ' : {count} byes. Les byes vont à des joueurs tirés au sort, jamais deux dans le même match.',
    ': {count} byes. Byes go to randomly drawn players, never two in the same match.',
    ': {count} pases directos. Los pases van a jugadores sorteados, nunca dos en el mismo partido.',
  ],
  'draw.noBye': [', aucun bye.', ', no byes.', ', sin pases directos.'],
  'draw.matches': ['Matchs', 'Matches', 'Partidos'],
  'draw.singleLeg': ['Aller simple', 'Single round', 'Solo ida'],
  'draw.doubleLeg': ['Aller-retour', 'Home and away', 'Ida y vuelta'],
  'draw.openCheckInFirst': [
    'Ouvre le pointage avant le tirage (onglet Pointage).',
    'Open check-in before the draw (Check-in tab).',
    'Abre la asistencia antes del sorteo (pestaña Asistencia).',
  ],
  'draw.needTwo': [
    'Il faut au moins 2 joueurs présents.',
    'At least 2 players must be present.',
    'Hacen falta al menos 2 jugadores presentes.',
  ],
  'draw.fairHint': [
    'Le serveur choisit la graine et la publie avec la liste des joueurs : personne ne peut « essayer » un tirage jusqu’à obtenir celui qu’il veut. Le tirage ne se refait pas.',
    'The server picks the seed and publishes it with the player list: nobody can “try” a draw until they get the one they want. The draw cannot be redone.',
    'El servidor elige la semilla y la publica con la lista de jugadores: nadie puede «probar» un sorteo hasta obtener el que quiere. El sorteo no se repite.',
  ],
  'draw.do': ['Faire le tirage', 'Do the draw', 'Hacer el sorteo'],

  // Langue du tournoi
  'lang.label': ['Langue du tournoi', 'Tournament language', 'Idioma del torneo'],
  'lang.hint': [
    'Celle de la page des joueurs et des messages du chat. Chaque joueur peut changer de langue pour lui-même.',
    'The language of the players’ page and of the chat messages. Each player can switch language for themselves.',
    'La de la página de los jugadores y de los mensajes del chat. Cada jugador puede cambiar de idioma para sí mismo.',
  ],
  'copy.language': [
    'Le message est écrit en {language}, la langue du tournoi.',
    'The message is written in {language}, the tournament language.',
    'El mensaje está escrito en {language}, el idioma del torneo.',
  ],

  // Onglets d'un tournoi
  'tabs.label': ['Sections du tournoi', 'Tournament sections', 'Secciones del torneo'],
  'tabs.registrations': ['Inscrits', 'Players', 'Inscritos'],
  'tabs.checkIn': ['Pointage', 'Check-in', 'Asistencia'],
  'tabs.draw': ['Tirage', 'Draw', 'Sorteo'],
  'tabs.play': ['En jeu', 'Live', 'En juego'],
  'tabs.log': ['Journal', 'Log', 'Registro'],
  'tournament.backToList': ['Retour aux tournois', 'Back to tournaments', 'Volver a los torneos'],
  'tournament.copyForChat': ['Copier pour le chat', 'Copy for the chat', 'Copiar para el chat'],
});
