import { defineMessages } from './types';

/** Matchs, saisie du score, classement, remplacement, relais (« la main »). */
export const play = defineMessages({
  // Matchs
  'match.state.done': ['TERMINÉ', 'FINISHED', 'TERMINADO'],
  'match.state.ready': ['À JOUER', 'TO PLAY', 'POR JUGAR'],
  'match.state.waiting': ['EN ATTENTE', 'WAITING', 'EN ESPERA'],
  'match.state.bye': ['BYE', 'BYE', 'PASE'],
  'match.state.forfeit': ['FORFAIT', 'FORFEIT', 'ABANDONO'],
  'match.n': ['Match {n}', 'Match {n}', 'Partido {n}'],
  'match.tbd': ['à déterminer', 'to be determined', 'por determinar'],
  'match.enterScore': [
    'Saisir le score du match {n}',
    'Enter the score of match {n}',
    'Introducir el marcador del partido {n}',
  ],
  'rounds.label': ['Tours', 'Rounds', 'Rondas'],
  'play.notDrawn': [
    'Le tirage n’est pas fait. ',
    'The draw has not been done. ',
    'El sorteo no está hecho. ',
  ],
  'play.goToDraw': ['Va à l’onglet Tirage.', 'Go to the Draw tab.', 'Ve a la pestaña Sorteo.'],
  'play.champion': [
    'Vainqueur du tournoi : {name}',
    'Tournament winner: {name}',
    'Ganador del torneo: {name}',
  ],
  'play.readOnly': [
    'Lecture seule : prends la main pour saisir les scores.',
    'Read only: take control to enter scores.',
    'Solo lectura: toma el control para introducir marcadores.',
  ],
  'play.rest': ['Repos : {name}', 'Rest: {name}', 'Descansa: {name}'],
  'play.sheetTitle': ['Match {n} · {round}', 'Match {n} · {round}', 'Partido {n} · {round}'],

  // Classement
  'standings.title': [
    'Classement ({played}/{total})',
    'Standings ({played}/{total})',
    'Clasificación ({played}/{total})',
  ],
  'standings.player': ['Joueur', 'Player', 'Jugador'],
  'standings.points': ['Pts', 'Pts', 'Pts'],
  'standings.record': ['V-D', 'W-L', 'G-P'],
  'standings.diff': ['Diff', 'Diff', 'Dif'],

  // Feuille de saisie du score
  'score.range': [
    'Le score va de 0 à {max}.',
    'The score goes from 0 to {max}.',
    'El marcador va de 0 a {max}.',
  ],
  'score.tie': [
    'Un match ne peut pas finir à égalité.',
    'A match cannot end in a tie.',
    'Un partido no puede terminar en empate.',
  ],
  'score.title': [
    'Saisir le score : {title}',
    'Enter the score: {title}',
    'Introducir el marcador: {title}',
  ],
  'score.enter': ['Entre le score final', 'Enter the final score', 'Introduce el marcador final'],
  'score.minus': [
    'Retirer un point à {name}',
    'Remove a point from {name}',
    'Quitar un punto a {name}',
  ],
  'score.plus': ['Ajouter un point à {name}', 'Add a point to {name}', 'Añadir un punto a {name}'],
  'score.of': ['Score de {name}', 'Score of {name}', 'Marcador de {name}'],
  'score.valid': [
    'Score valide : {name} gagne',
    'Valid score: {name} wins',
    'Marcador válido: gana {name}',
  ],
  'score.forfeit': ['Forfait', 'Forfeit', 'Abandono'],
  'score.save': ['Enregistrer le score', 'Save the score', 'Guardar el marcador'],
  'score.delete': ['Supprimer le score', 'Delete the score', 'Eliminar el marcador'],
  'score.forfeitWho': [
    'Qui déclare forfait ? Son adversaire gagne ',
    'Who forfeits? Their opponent wins ',
    '¿Quién abandona? Su rival gana ',
  ],
  'score.forfeitOf': ['Forfait de {name}', '{name} forfeits', 'Abandono de {name}'],
  'score.backToScore': ['Retour au score', 'Back to the score', 'Volver al marcador'],

  // Remplacement
  'replace.title': ['Remplacer un joueur', 'Replace a player', 'Sustituir a un jugador'],
  'replace.absent': ['Joueur absent', 'Absent player', 'Jugador ausente'],
  'replace.substitute': ['Remplaçant', 'Substitute', 'Sustituto'],
  'replace.choose': ['Choisir', 'Choose', 'Elegir'],
  'replace.waitlist': [' (liste d’attente)', ' (waiting list)', ' (lista de espera)'],
  'replace.submit': ['Remplacer', 'Replace', 'Sustituir'],

  // La main
  'relay.region': [
    'La main sur ce tournoi',
    'Control of this tournament',
    'El control de este torneo',
  ],
  'relay.youHave': ['TU AS LA MAIN', 'YOU HAVE CONTROL', 'TIENES EL CONTROL'],
  'relay.offeredTo': [
    'Relais proposé à {name}',
    'Handover offered to {name}',
    'Relevo propuesto a {name}',
  ],
  'relay.cancelOffer': ['Annuler la proposition', 'Cancel the offer', 'Cancelar la propuesta'],
  'relay.pass': ['Passer le relais', 'Hand over', 'Pasar el relevo'],
  'relay.release': ['Rendre la main', 'Release control', 'Devolver el control'],
  'relay.offeredBadge': ['RELAIS PROPOSÉ', 'HANDOVER OFFERED', 'RELEVO PROPUESTO'],
  'relay.accept': ['Accepter', 'Accept', 'Aceptar'],
  'relay.decline': ['Refuser', 'Decline', 'Rechazar'],
  'relay.heldBy': ['MAIN : {name}', 'CONTROL: {name}', 'CONTROL: {name}'],
  'relay.reclaim': ['Reprendre la main', 'Take control back', 'Retomar el control'],
  'relay.nobody': ['PERSONNE N’A LA MAIN', 'NOBODY HAS CONTROL', 'NADIE TIENE EL CONTROL'],
  'relay.take': ['Prendre la main', 'Take control', 'Tomar el control'],
  'relay.passTo': ['Passer le relais à', 'Hand over to', 'Pasar el relevo a'],
  'relay.chooseAdmin': ['Choisir un admin', 'Choose an admin', 'Elegir un admin'],
  'relay.propose': ['Proposer', 'Offer', 'Proponer'],
  'relay.nothingChanges': [
    'Rien ne change avant son accord.',
    'Nothing changes until they agree.',
    'Nada cambia hasta que acepte.',
  ],
  'relay.readOnly': [
    'Tu peux tout lire, mais seul l’admin qui tient la main peut modifier le tournoi.',
    'You can read everything, but only the admin who has control can change the tournament.',
    'Puedes leerlo todo, pero solo el admin que tiene el control puede modificar el torneo.',
  ],
  'relay.offerRegion': [
    'Relais proposé sur {name}',
    'Handover offered on {name}',
    'Relevo propuesto en {name}',
  ],
  'relay.offerText': [
    'te passe la main sur {tournament}',
    'is handing you control of {tournament}',
    'te pasa el control de {tournament}',
  ],
  'relay.anAdmin': ['Un admin', 'An admin', 'Un admin'],
});
