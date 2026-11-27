import { defineMessages } from './types';

/**
 * Page de confidentialité, lue par les joueurs et les admins. Elle dit ce que l'application FAIT, pas
 * ce qu'on voudrait qu'elle fasse : toute évolution des données, de leur durée ou de qui les voit se
 * reporte ici ET dans le registre (docs/rgpd/registre-traitements.md).
 */
export const privacy = defineMessages({
  'privacy.link': ['Confidentialité', 'Privacy', 'Privacidad'],
  'privacy.title': ['Confidentialité', 'Privacy', 'Privacidad'],
  'privacy.updated': [
    'Dernière mise à jour : {date}',
    'Last updated: {date}',
    'Última actualización: {date}',
  ],
  'privacy.intro': [
    'i-am-in sert à organiser des tournois entre joueurs de Plato. C’est un projet personnel, sans lien avec Plato. Voici les données utilisées, pourquoi, par qui et combien de temps.',
    'i-am-in is used to run tournaments between Plato players. It is a personal project, not affiliated with Plato. Here is which data is used, why, by whom and for how long.',
    'i-am-in sirve para organizar torneos entre jugadores de Plato. Es un proyecto personal, sin relación con Plato. Estos son los datos que se usan, para qué, quién los ve y durante cuánto tiempo.',
  ],

  'privacy.who.title': ['Responsable', 'Who is responsible', 'Responsable'],
  'privacy.who.name': [
    'Le responsable du traitement est Souleymane Fall, à titre personnel.',
    'The data controller is Souleymane Fall, as a private individual.',
    'El responsable del tratamiento es Souleymane Fall, a título personal.',
  ],
  'privacy.who.contact': [
    'Pour une question ou une demande : le formulaire « Donner mon avis », en indiquant ton pseudo Plato. Un joueur peut aussi s’adresser à un admin du groupe.',
    'For a question or a request: the “Give feedback” form, with your Plato username. A player can also ask a group admin.',
    'Para una pregunta o una solicitud: el formulario «Dar mi opinión», indicando tu usuario de Plato. Un jugador también puede dirigirse a un admin del grupo.',
  ],

  'privacy.players.title': [
    'Si tu es joueur (sans compte)',
    'If you are a player (no account)',
    'Si eres jugador (sin cuenta)',
  ],
  'privacy.players.data': [
    'Données : ton pseudo Plato, l’état de ton inscription, ta présence, tes résultats et la date de ton inscription. Ni e-mail, ni nom réel.',
    'Data: your Plato username, your registration status, your attendance, your results and the date you registered. No email, no real name.',
    'Datos: tu usuario de Plato, el estado de tu inscripción, tu asistencia, tus resultados y la fecha de tu inscripción. Ni correo ni nombre real.',
  ],
  'privacy.players.why': [
    'But : gérer l’inscription, le pointage, la liste d’attente et les résultats. Base : notre intérêt légitime à organiser le tournoi auquel tu t’inscris toi-même.',
    'Purpose: to handle registration, check-in, the waiting list and results. Basis: our legitimate interest in running the tournament you register for yourself.',
    'Finalidad: gestionar la inscripción, la pasada de lista, la lista de espera y los resultados. Base: nuestro interés legítimo en organizar el torneo al que tú mismo te inscribes.',
  ],
  'privacy.players.public': [
    'Une fois ton inscription validée, ton pseudo (aussi sur la liste d’attente) et tes résultats sont visibles par toute personne qui a le lien du tournoi.',
    'Once your registration is approved, your username (also on the waiting list) and your results are visible to anyone who has the tournament link.',
    'Una vez validada tu inscripción, tu usuario (también en la lista de espera) y tus resultados son visibles para cualquiera que tenga el enlace del torneo.',
  ],
  'privacy.players.who': [
    'Les admins du groupe voient aussi les inscriptions à valider. Le tableau de bord du propriétaire de la plateforme n’affiche que des nombres, jamais ton pseudo.',
    'Group admins also see registrations awaiting approval. The platform owner’s dashboard shows numbers only, never your username.',
    'Los admins del grupo también ven las inscripciones pendientes. El panel del propietario de la plataforma solo muestra números, nunca tu usuario.',
  ],

  'privacy.admins.title': [
    'Si tu es admin (avec un compte)',
    'If you are an admin (with an account)',
    'Si eres admin (con cuenta)',
  ],
  'privacy.admins.data': [
    'Données : identifiant, pseudo Plato, empreinte du mot de passe (jamais le mot de passe), rôle et groupes ; avec la double authentification, un secret chiffré et des codes de secours illisibles.',
    'Data: username, Plato username, a fingerprint of your password (never the password), role and groups; with two-factor authentication, an encrypted secret and unreadable backup codes.',
    'Datos: identificador, usuario de Plato, huella de la contraseña (nunca la contraseña), rol y grupos; con la doble autenticación, un secreto cifrado y códigos de respaldo ilegibles.',
  ],
  'privacy.admins.security': [
    'Pour la sécurité : tes sessions avec un appareil lisible (par exemple « Chrome · Windows ») et un journal des connexions et changements sensibles, que toi seul lis dans l’écran Sécurité.',
    'For security: your sessions with a readable device (for example “Chrome · Windows”) and a log of sign-ins and sensitive changes, which only you can read on the Security screen.',
    'Por seguridad: tus sesiones con un dispositivo legible (por ejemplo «Chrome · Windows») y un registro de accesos y cambios sensibles, que solo tú lees en la pantalla Seguridad.',
  ],
  'privacy.admins.who': [
    'Le propriétaire de la plateforme voit ton identifiant, ton pseudo Plato, ton rôle, tes groupes et la date de ta dernière activité. Les admins de ton groupe voient que tu en fais partie, et le journal de chaque tournoi montre qui a fait quoi.',
    'The platform owner sees your username, Plato username, role, groups and the date of your last activity. Admins of your group see that you belong to it, and each tournament log shows who did what.',
    'El propietario de la plataforma ve tu identificador, tu usuario de Plato, tu rol, tus grupos y la fecha de tu última actividad. Los admins de tu grupo ven que formas parte, y el registro de cada torneo muestra quién hizo qué.',
  ],
  'privacy.admins.basis': [
    'Base : notre intérêt légitime à fournir le service que tu utilises et à le protéger.',
    'Basis: our legitimate interest in providing the service you use and in protecting it.',
    'Base: nuestro interés legítimo en prestar el servicio que usas y protegerlo.',
  ],

  'privacy.other.title': [
    'Avis et journal technique',
    'Feedback and technical log',
    'Opiniones y registro técnico',
  ],
  'privacy.other.feedback': [
    'Un avis envoyé garde son type, ton message, la date et, seulement si tu le laisses, ton pseudo Plato. Seul le propriétaire le lit. N’y mets pas d’informations personnelles inutiles.',
    'Feedback keeps its type, your message, the date and, only if you leave it, your Plato username. Only the owner reads it. Do not put unnecessary personal information in it.',
    'Una opinión guarda su tipo, tu mensaje, la fecha y, solo si lo dejas, tu usuario de Plato. Solo el propietario la lee. No pongas información personal innecesaria.',
  ],
  'privacy.other.log': [
    'Pour réparer les pannes et bloquer les abus, un journal technique note l’heure, l’action, son résultat et l’identifiant interne du compte connecté. Il ne contient ni adresse IP, ni pseudo de joueur, ni mot de passe. Une erreur de l’écran y envoie son message, sa trace et la page, sans ses paramètres.',
    'To fix failures and stop abuse, a technical log records the time, the action, its result and the internal identifier of the signed-in account. It contains no IP address, no player username, no password. A screen error sends it its message, its trace and the page, without parameters.',
    'Para reparar fallos y frenar abusos, un registro técnico anota la hora, la acción, su resultado y el identificador interno de la cuenta conectada. No contiene dirección IP, usuario de jugador ni contraseña. Un error de pantalla le envía su mensaje, su traza y la página, sin parámetros.',
  ],
  'privacy.other.ip': [
    'Ton adresse IP sert un instant, en mémoire, à limiter le nombre de demandes. Elle n’est pas enregistrée.',
    'Your IP address is used briefly, in memory, to limit the number of requests. It is not stored.',
    'Tu dirección IP se usa un instante, en memoria, para limitar el número de peticiones. No se guarda.',
  ],

  'privacy.device.title': ['Sur ton appareil', 'On your device', 'En tu dispositivo'],
  'privacy.device.cookie': [
    'Un cookie de connexion, seulement pour les admins connectés. Il est nécessaire au service.',
    'A sign-in cookie, only for signed-in admins. The service needs it.',
    'Una cookie de sesión, solo para los admins conectados. El servicio la necesita.',
  ],
  'privacy.device.storage': [
    'Dans le stockage du navigateur : ton lien personnel de joueur (pour retrouver ton inscription), la langue et le thème choisis.',
    'In your browser storage: your personal player link (to find your registration again), your chosen language and theme.',
    'En el almacenamiento del navegador: tu enlace personal de jugador (para recuperar tu inscripción), el idioma y el tema elegidos.',
  ],
  'privacy.device.noTracking': [
    'Ni publicité, ni mesure d’audience, ni traceur d’un tiers. Rien n’est vendu.',
    'No advertising, no analytics, no third-party tracker. Nothing is sold.',
    'Sin publicidad, sin medición de audiencia, sin rastreadores de terceros. No se vende nada.',
  ],

  'privacy.keep.title': ['Durées', 'How long', 'Plazos'],
  'privacy.keep.players': [
    'Inscriptions et résultats : gardés avec le tournoi. Il n’y a pas encore de suppression automatique. Annuler ton inscription avec ton lien personnel, avant le tirage, supprime ta ligne tout de suite ; sinon, demande son effacement.',
    'Registrations and results: kept with the tournament. There is no automatic deletion yet. Cancelling your registration with your personal link, before the draw, deletes it right away; otherwise, ask for it to be erased.',
    'Inscripciones y resultados: se conservan con el torneo. Aún no hay borrado automático. Si anulas tu inscripción con tu enlace personal, antes del sorteo, se borra al momento; si no, pide que se borre.',
  ],
  'privacy.keep.accounts': [
    'Comptes : tant qu’ils existent ; suppression sur demande. Les demandes de nouveau mot de passe n’ont pas encore de suppression automatique.',
    'Accounts: as long as they exist; deleted on request. Password reset requests are not deleted automatically yet.',
    'Cuentas: mientras existan; se borran a petición. Las solicitudes de nueva contraseña todavía no se borran automáticamente.',
  ],
  'privacy.keep.security': [
    'Sessions : 7 jours au plus (12 heures pour le propriétaire). Journal de sécurité : 30 jours.',
    'Sessions: 7 days at most (12 hours for the owner). Security log: 30 days.',
    'Sesiones: 7 días como máximo (12 horas para el propietario). Registro de seguridad: 30 días.',
  ],
  'privacy.keep.other': [
    'Avis traités : supprimés par le propriétaire après un an. Journal technique : effacé au fil du temps, selon sa taille. Sauvegardes : 30 jours ; une donnée effacée peut y rester pendant ce délai.',
    'Handled feedback: deleted by the owner after one year. Technical log: erased over time, depending on its size. Backups: 30 days; erased data may remain in them during that period.',
    'Opiniones tratadas: el propietario las borra después de un año. Registro técnico: se borra con el tiempo, según su tamaño. Copias de seguridad: 30 días; un dato borrado puede permanecer en ellas ese plazo.',
  ],

  'privacy.rights.title': ['Tes droits', 'Your rights', 'Tus derechos'],
  'privacy.rights.list': [
    'Tu peux demander à voir tes données, à les corriger, à les effacer, à limiter leur usage ou t’y opposer. Une réponse est due dans un délai d’un mois ; pour vérifier que la demande vient bien de toi, ton pseudo Plato peut t’être demandé.',
    'You can ask to see your data, correct it, erase it, restrict its use or object to it. An answer is due within one month; to check the request really comes from you, you may be asked for your Plato username.',
    'Puedes pedir ver tus datos, corregirlos, borrarlos, limitar su uso u oponerte. Corresponde responder en el plazo de un mes; para comprobar que la solicitud es tuya, se te puede pedir tu usuario de Plato.',
  ],
  'privacy.rights.admin': [
    'La personne qui administre le serveur a techniquement accès à la base de données. Elle ne s’en sert que pour la maintenance, la sécurité ou une demande comme celle-ci.',
    'The person who runs the server technically has access to the database. They only use it for maintenance, security or a request like this one.',
    'La persona que administra el servidor tiene técnicamente acceso a la base de datos. Solo lo usa para mantenimiento, seguridad o una solicitud como esta.',
  ],
  'privacy.rights.complaint': [
    'Si la réponse ne te convient pas, tu peux saisir la CNIL (www.cnil.fr) ou l’autorité de protection des données de ton pays.',
    'If the answer does not satisfy you, you can complain to the CNIL (www.cnil.fr) or to your country’s data protection authority.',
    'Si la respuesta no te convence, puedes reclamar ante la CNIL (www.cnil.fr) o ante la autoridad de protección de datos de tu país.',
  ],
});
