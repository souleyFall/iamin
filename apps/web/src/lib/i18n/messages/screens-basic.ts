import { defineMessages } from './types';

/** Moi, journal d'un tournoi, copie pour le chat. */
export const screensBasic = defineMessages({
  // Moi
  'me.title': ['Moi', 'Me', 'Yo'],
  'me.plato': ['Pseudo Plato : {name}', 'Plato username: {name}', 'Usuario de Plato: {name}'],
  'me.inviteSuperAdmin': [
    'Inviter un super admin',
    'Invite a super admin',
    'Invitar a un superadmin',
  ],
  'me.feedbackInbox': ['Retours des utilisateurs', 'User feedback', 'Comentarios de los usuarios'],
  'me.security': ['Sécurité du compte', 'Account security', 'Seguridad de la cuenta'],
  'me.securityMfa': [
    ' (double authentification)',
    ' (two-factor authentication)',
    ' (verificación en dos pasos)',
  ],
  'me.giveFeedback': ['Donner mon avis', 'Give feedback', 'Dar mi opinión'],
  'me.theme': ['Thème', 'Theme', 'Tema'],
  'me.themeDark': ['Sombre', 'Dark', 'Oscuro'],
  'me.themeLight': ['Clair', 'Light', 'Claro'],

  // Journal
  'journal.title': ['Journal', 'Log', 'Registro'],
  'journal.hint': [
    'Chaque changement y laisse une trace. Aucun pseudo de joueur n’y est conservé.',
    'Every change leaves a trace here. No player username is kept.',
    'Cada cambio deja una huella aquí. No se guarda ningún usuario de jugador.',
  ],
  'journal.older': ['Voir les plus anciens', 'Show older', 'Ver los más antiguos'],
  'journal.seed': ['graine {seed}…', 'seed {seed}…', 'semilla {seed}…'],
  'event.TOURNAMENT_CREATED': ['Tournoi créé', 'Tournament created', 'Torneo creado'],
  'event.TOURNAMENT_UPDATED': ['Réglages modifiés', 'Settings changed', 'Ajustes modificados'],
  'event.PLAYER_REGISTERED': ['Inscription reçue', 'Registration received', 'Inscripción recibida'],
  'event.PLAYER_WITHDREW': [
    'Un joueur a annulé son inscription',
    'A player withdrew',
    'Un jugador canceló su inscripción',
  ],
  'event.PLAYER_ADDED': [
    'Joueur ajouté par un admin',
    'Player added by an admin',
    'Jugador añadido por un admin',
  ],
  'event.PLAYER_ACCEPTED': ['Inscription validée', 'Registration approved', 'Inscripción validada'],
  'event.PLAYER_PROMOTED': [
    'Liste d’attente : joueur promu',
    'Waiting list: player promoted',
    'Lista de espera: jugador promovido',
  ],
  'event.PLAYER_REMOVED': ['Joueur retiré', 'Player removed', 'Jugador retirado'],
  'event.PRESENCE_SET': ['Présence pointée', 'Attendance recorded', 'Asistencia registrada'],
  'event.DRAW_DONE': ['Tirage effectué', 'Draw done', 'Sorteo realizado'],
  'event.RESULT_SET': ['Score saisi', 'Score entered', 'Marcador introducido'],
  'event.RESULT_DELETED': ['Score supprimé', 'Score deleted', 'Marcador eliminado'],
  'event.PLAYER_REPLACED': ['Joueur remplacé', 'Player replaced', 'Jugador sustituido'],
  'event.RELAY_TAKEN': ['Main prise', 'Control taken', 'Control tomado'],
  'event.RELAY_RECLAIMED': [
    'Main reprise par le super admin',
    'Control taken back by the super admin',
    'Control retomado por el superadmin',
  ],
  'event.RELAY_RELEASED': ['Main rendue', 'Control released', 'Control devuelto'],
  'event.RELAY_OFFERED': ['Relais proposé', 'Handover offered', 'Relevo propuesto'],
  'event.RELAY_ACCEPTED': ['Relais accepté', 'Handover accepted', 'Relevo aceptado'],
  'event.RELAY_DECLINED': ['Relais refusé', 'Handover declined', 'Relevo rechazado'],
  'event.RELAY_CANCELED': [
    'Proposition de relais annulée',
    'Handover offer canceled',
    'Propuesta de relevo cancelada',
  ],

  // Copier pour le chat
  'copy.title': ['Copier pour le chat', 'Copy for the chat', 'Copiar para el chat'],
  'copy.backToTournament': ['Retour au tournoi', 'Back to the tournament', 'Volver al torneo'],
  'copy.which': ['Quel message ?', 'Which message?', '¿Qué mensaje?'],
  'copy.preview': ['Aperçu du message', 'Message preview', 'Vista previa del mensaje'],
  'copy.button': ['Copier le message', 'Copy the message', 'Copiar el mensaje'],
  'copy.done': [
    'Copié : colle-le dans le chat.',
    'Copied: paste it into the chat.',
    'Copiado: pégalo en el chat.',
  ],
  'copy.refused': [
    'Le navigateur refuse la copie : sélectionne le texte ci-dessus.',
    'The browser refused the copy: select the text above.',
    'El navegador rechaza la copia: selecciona el texto de arriba.',
  ],
  'chat.registrations': ['Liste des inscrits', 'Registered players', 'Lista de inscritos'],
  'chat.round': ['Journée {n}', 'Matchday {n}', 'Jornada {n}'],
  'chat.vs': ['{name} : VS', '{name}: VS', '{name}: VS'],
  'chat.results': ['{name} : résultats', '{name}: results', '{name}: resultados'],
  'chat.standings': ['Classement', 'Standings', 'Clasificación'],

  // Noms des tours d'élimination
  'round.final': ['Finale', 'Final', 'Final'],
  'round.semi': ['Demi-finales', 'Semi-finals', 'Semifinales'],
  'round.quarter': ['Quarts de finale', 'Quarter-finals', 'Cuartos de final'],
  'round.n': ['Tour {n}', 'Round {n}', 'Ronda {n}'],
});
