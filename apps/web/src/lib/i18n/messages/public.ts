import { defineMessages } from './types';

/** Page publique d'un tournoi (joueurs sans compte) et messages d'erreur du client. */
export const publicPage = defineMessages({
  'pub.notFound': [
    'Ce lien ne correspond à aucun tournoi. Vérifie-le auprès de l’admin qui te l’a envoyé.',
    'This link does not match any tournament. Check it with the admin who sent it to you.',
    'Este enlace no corresponde a ningún torneo. Compruébalo con el admin que te lo envió.',
  ],
  'pub.live': ['EN DIRECT', 'LIVE', 'EN DIRECTO'],
  'pub.closed': [
    'Les inscriptions sont closes.',
    'Registration is closed.',
    'Las inscripciones están cerradas.',
  ],
  'pub.matches': ['Matchs', 'Matches', 'Partidos'],
  'pub.verify': ['Vérifier le tirage', 'Verify the draw', 'Verificar el sorteo'],
  'pub.verifyHint': [
    'Avec la même liste de joueurs et cette graine, le tirage se refait à l’identique.',
    'With the same player list and this seed, the draw can be redone identically.',
    'Con la misma lista de jugadores y esta semilla, el sorteo se repite idéntico.',
  ],
  'pub.players': ['Inscrits · {n}', 'Registered · {n}', 'Inscritos · {n}'],
  'pub.nobody': [
    'Personne n’est encore validé.',
    'Nobody is approved yet.',
    'Nadie está validado todavía.',
  ],
  'pub.waitlist': ['Liste d’attente · {n}', 'Waiting list · {n}', 'Lista de espera · {n}'],

  // Mon inscription
  'pub.mine.gone': [
    'Ton inscription n’existe plus. Tu peux t’inscrire à nouveau si c’est encore ouvert.',
    'Your registration no longer exists. You can register again if it is still open.',
    'Tu inscripción ya no existe. Puedes inscribirte de nuevo si sigue abierto.',
  ],
  'pub.mine.ok': ['D’accord', 'OK', 'De acuerdo'],
  'pub.mine.loading': [
    'Chargement de ton inscription…',
    'Loading your registration…',
    'Cargando tu inscripción…',
  ],
  'pub.mine.title': ['Ton inscription', 'Your registration', 'Tu inscripción'],
  'pub.mine.PENDING': [
    'En attente de validation par un admin.',
    'Waiting for an admin to approve.',
    'Esperando la validación de un admin.',
  ],
  'pub.mine.ACCEPTED': [
    'Inscription validée. Tu as ta place.',
    'Registration approved. You have your place.',
    'Inscripción validada. Tienes tu plaza.',
  ],
  'pub.mine.REPLACED': [
    'Tu as été remplacé dans le tirage.',
    'You have been replaced in the draw.',
    'Te han sustituido en el sorteo.',
  ],
  'pub.mine.waitlist': [
    'Liste d’attente. Si une place se libère, tu passes automatiquement.',
    'Waiting list. If a place frees up, you move up automatically.',
    'Lista de espera. Si se libera una plaza, pasas automáticamente.',
  ],
  'pub.mine.waitlistPos': [
    'Liste d’attente : tu es n°{n}. Si une place se libère, tu passes automatiquement.',
    'Waiting list: you are number {n}. If a place frees up, you move up automatically.',
    'Lista de espera: eres el n.º {n}. Si se libera una plaza, pasas automáticamente.',
  ],
  'pub.mine.present': ['Pointé présent.', 'Checked in as present.', 'Registrado como presente.'],
  'pub.mine.withdrawConfirm': ['Oui, annuler', 'Yes, cancel', 'Sí, cancelar'],
  'pub.mine.withdraw': [
    'Annuler mon inscription',
    'Cancel my registration',
    'Cancelar mi inscripción',
  ],

  // Formulaire d'inscription
  'pub.register.title': ['T’inscrire', 'Register', 'Inscribirte'],
  'pub.register.name': ['Ton pseudo Plato', 'Your Plato username', 'Tu usuario de Plato'],
  'pub.register.hint': [
    'Seul ton pseudo est demandé. Un admin valide chaque inscription, puis tu retrouves ton statut ici.',
    'Only your username is asked. An admin approves each registration, then you find your status here.',
    'Solo se pide tu usuario. Un admin valida cada inscripción y luego encuentras tu estado aquí.',
  ],
  'pub.register.submit': [
    'Envoyer mon inscription',
    'Send my registration',
    'Enviar mi inscripción',
  ],

  // Erreurs génériques du client (quand le serveur ne donne pas de message)
  'err.400': ['Données invalides.', 'Invalid data.', 'Datos no válidos.'],
  'err.401': ['Connexion requise.', 'Sign-in required.', 'Se requiere iniciar sesión.'],
  'err.403': ['Action non autorisée.', 'Action not allowed.', 'Acción no permitida.'],
  'err.404': ['Introuvable.', 'Not found.', 'No encontrado.'],
  'err.409': [
    'Action impossible dans l’état actuel.',
    'Action not possible in the current state.',
    'Acción imposible en el estado actual.',
  ],
  'err.429': [
    'Trop de tentatives, réessaie dans une minute.',
    'Too many attempts, try again in a minute.',
    'Demasiados intentos, vuelve a intentarlo en un minuto.',
  ],
  'err.server': [
    'Le serveur a répondu par une erreur.',
    'The server answered with an error.',
    'El servidor respondió con un error.',
  ],
  'err.ref': ['réf.', 'ref.', 'ref.'],
  'err.crash.title': ['Quelque chose s’est cassé.', 'Something broke.', 'Algo se ha roto.'],
  'err.crash.body': [
    'L’erreur a été signalée. Recharge la page pour continuer.',
    'The error was reported. Reload the page to continue.',
    'El error se ha notificado. Recarga la página para continuar.',
  ],
  'err.crash.reload': ['Recharger', 'Reload', 'Recargar'],
  'err.network': [
    'Serveur injoignable. Vérifie ta connexion.',
    'Server unreachable. Check your connection.',
    'Servidor inaccesible. Comprueba tu conexión.',
  ],
});
