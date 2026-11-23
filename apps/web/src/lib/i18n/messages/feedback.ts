import { defineMessages } from './types';

/** Donner son avis, boîte de retours du propriétaire. */
export const feedback = defineMessages({
  'fb.title': ['Donner mon avis', 'Give feedback', 'Dar mi opinión'],
  'fb.kind': ['Type de retour', 'Type of feedback', 'Tipo de comentario'],
  'fb.message': ['Ton message', 'Your message', 'Tu mensaje'],
  'fb.placeholderBug': [
    'Ce que tu as fait, ce qui s’est passé, ce que tu attendais.',
    'What you did, what happened, what you expected.',
    'Lo que hiciste, lo que pasó y lo que esperabas.',
  ],
  'fb.placeholderIdea': [
    'Décris ton idée ou ce qui pourrait être mieux.',
    'Describe your idea or what could be better.',
    'Describe tu idea o lo que podría mejorar.',
  ],
  'fb.contact': [
    'Ton pseudo Plato (facultatif)',
    'Your Plato username (optional)',
    'Tu usuario de Plato (opcional)',
  ],
  'fb.contactHint': [
    'Seulement si tu veux qu’on puisse te répondre.',
    'Only if you want us to be able to reply.',
    'Solo si quieres que podamos responderte.',
  ],
  'fb.send': ['Envoyer', 'Send', 'Enviar'],
  'fb.withAccount': [
    'Ton identifiant est joint à ton message.',
    'Your username is attached to your message.',
    'Tu identificador se adjunta a tu mensaje.',
  ],
  'fb.anonymous': [
    'Sans compte, ton message est anonyme.',
    'Without an account, your message is anonymous.',
    'Sin cuenta, tu mensaje es anónimo.',
  ],
  'fb.ownerOnly': [
    'Seul le propriétaire de la plateforme le lit.',
    'Only the platform owner reads it.',
    'Solo lo lee el propietario de la plataforma.',
  ],
  'fb.signIn': ['Se connecter', 'Sign in', 'Iniciar sesión'],
  'fb.thanks': ['Merci !', 'Thank you!', '¡Gracias!'],
  'fb.received': [
    'Ton retour est bien reçu. Il sera lu par le responsable d’i-am-in.',
    'Your feedback has been received. It will be read by the person in charge of i-am-in.',
    'Tu comentario se ha recibido. Lo leerá el responsable de i-am-in.',
  ],

  // Boîte de réception
  'fb.inbox.title': ['Retours', 'Feedback', 'Comentarios'],
  'fb.inbox.reason': [
    'Supprimer un retour ou purger demande ton code. Lire et classer ne le demandent pas.',
    'Deleting a feedback or purging asks for your code. Reading and sorting do not.',
    'Eliminar un comentario o purgar pide tu código. Leer y clasificar no lo piden.',
  ],
  'fb.inbox.filter': ['Filtrer par statut', 'Filter by status', 'Filtrar por estado'],
  'fb.inbox.new': ['Nouveaux', 'New', 'Nuevos'],
  'fb.inbox.read': ['Lus', 'Read', 'Leídos'],
  'fb.inbox.done': ['Traités', 'Done', 'Resueltos'],
  'fb.inbox.all': ['Tous', 'All', 'Todos'],
  'fb.inbox.empty': [
    'Aucun retour dans cette catégorie.',
    'No feedback in this category.',
    'Ningún comentario en esta categoría.',
  ],
  'fb.inbox.fromAdmin': ['Admin {name}', 'Admin {name}', 'Admin {name}'],
  'fb.inbox.fromPlayer': ['Joueur · {name}', 'Player · {name}', 'Jugador · {name}'],
  'fb.inbox.fromAnon': ['Joueur anonyme', 'Anonymous player', 'Jugador anónimo'],
  'fb.inbox.markRead': ['Marquer comme lu', 'Mark as read', 'Marcar como leído'],
  'fb.inbox.markDone': ['Marquer comme traité', 'Mark as done', 'Marcar como resuelto'],
  'fb.inbox.markNew': ['Remettre en nouveau', 'Mark as new', 'Marcar como nuevo'],
  'fb.inbox.deleteConfirm': ['Supprimer pour de bon', 'Delete for good', 'Eliminar para siempre'],
  'fb.inbox.cleanTitle': ['Nettoyage', 'Cleanup', 'Limpieza'],
  'fb.inbox.cleanHint': [
    'Les retours traités depuis plus d’un an sont à supprimer (registre RGPD, traitement 6).',
    'Feedback marked done for over a year should be deleted (GDPR register, processing 6).',
    'Los comentarios resueltos hace más de un año deben eliminarse (registro RGPD, tratamiento 6).',
  ],
  'fb.inbox.purgeConfirm': ['Purger maintenant', 'Purge now', 'Purgar ahora'],
  'fb.inbox.purge': [
    'Purger les retours traités depuis plus d’un an',
    'Purge feedback done over a year ago',
    'Purgar los comentarios resueltos hace más de un año',
  ],
  'fb.inbox.purged_one': [
    '{count} retour supprimé.',
    '{count} feedback deleted.',
    '{count} comentario eliminado.',
  ],
  'fb.inbox.purged_other': [
    '{count} retours supprimés.',
    '{count} feedback deleted.',
    '{count} comentarios eliminados.',
  ],
});
