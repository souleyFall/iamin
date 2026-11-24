# Décisions techniques

Chaque décision est numérotée. Une décision remplacée n'est pas supprimée : on l'annote.

## D1. Monorepo pnpm

Un seul dépôt, des sous-projets dans `apps/` (API, interface) et `packages/` (code partagé). Les schémas de validation et les types sont partagés entre l'API et l'interface ; le moteur de tournoi (D6) est utilisé par les deux.

## D2. React + Vite (PWA), NestJS, Prisma, PostgreSQL

- **Interface** : React avec Vite, sans rendu serveur : une PWA n'en a pas besoin. TanStack Query pour les données, `vite-plugin-pwa` pour l'installation _(remplacé : manifeste et service worker écrits à la main, voir D20)_.
- **API** : NestJS. Ses modules correspondent au domaine (`auth`, `groups`, `tournaments`, `registrations`, `matches`, `live`), et ses _guards_ portent les permissions.
- **Base** : PostgreSQL, car les données sont relationnelles (tournoi, inscriptions, matchs). Prisma pour le schéma typé et les migrations.
- Pas de service tiers pour l'authentification, la base ou le temps réel : le projet est volontairement maison de bout en bout.

## D3. Sessions côté serveur, pas de JWT

Un seul serveur et une seule base : le principal intérêt du JWT (vérifier l'identité sans consulter la base) ne sert pas ici, puisque le rôle et le relais sont relus en base à chaque écriture. Les sessions se révoquent immédiatement (retrait d'un admin, vol de jeton).

- Jeton aléatoire de 256 bits dans un cookie `httpOnly`, `Secure` en production, préfixe `__Host-`. Seule son empreinte SHA-256 est stockée.
- Mots de passe : argon2id (paramètres OWASP). Comparaison à temps constant, même message pour « identifiant inconnu » et « mauvais mot de passe ».
- Jeton anti-CSRF par session, exigé sur toute requête qui modifie des données.
- Repris d'airpost, dont l'implémentation sert de modèle.

## D4. Flux de travail

Une branche et une pull request par sujet, nommées `feat/...`, `fix/...`, `chore/...`. Fusion en « squash » : un commit par PR sur `main`. Chaque PR est relue (revue écrite dans la PR), et la CI doit passer. Un hook `pre-push` lance les mêmes contrôles que la CI (`pnpm check`).

## D5. Relais entre admins

Un seul admin « tient la main » par tournoi : lui seul écrit. Les autres admins du groupe lisent. Il peut passer le relais à un autre admin, qui doit l'accepter. Le super admin du groupe peut le reprendre à tout moment.

- Contrôle **uniquement côté serveur** : toute écriture vérifie `holder_id` dans une transaction (`SELECT … FOR UPDATE` sur le tournoi).
- Colonne `version` sur les matchs pour refuser une écriture concurrente.
- Journal d'événements : qui a fait quoi, quand.

## D6. Moteur de tournoi pur

`packages/engine` : TypeScript pur, sans dépendance à la base ni à l'interface. Il contient la génération des arbres, les byes, les calendriers de ligue, les classements, les départages et les générateurs de texte pour le chat. Il est testé à fond (Vitest) : c'est la logique métier difficile.

## D7. Temps réel par SSE

La page publique reçoit un événement à chaque changement (`Server-Sent Events`), puis recharge les données. Plus simple que WebSocket (HTTP classique, reconnexion automatique). Un émetteur en mémoire suffit tant qu'il n'y a qu'une instance d'API ; au-delà, `LISTEN/NOTIFY` de PostgreSQL. Repli : scrutation toutes les 10 s.

## D8. Rôles et invitations

Trois rôles : **propriétaire** de la plateforme (valide les super admins, traite les tickets), **super admin** (crée ses groupes, y invite ses admins, reprend le relais), **admin**. Depuis [D22](#d22-le-super-admin-crée-ses-groupes), le propriétaire ne crée plus de groupe : il invite seulement des super admins. L'inscription d'un compte se fait sur invitation. Le mot de passe oublié passe par un ticket que reçoit le propriétaire, qui vérifie l'identité via Plato avant de transmettre un lien de réinitialisation à usage unique et de courte durée.

## D9. Joueurs sans compte

Un joueur s'inscrit avec son seul pseudo Plato via un lien. L'admin valide chaque inscription (un pseudo peut être usurpé). Le joueur reçoit un lien personnel secret pour suivre son statut et annuler.

## D10. Absents, liste d'attente et nombres impairs

- Statuts d'inscription : accepté, liste d'attente, retiré, avec pointage présent / absent avant le tirage.
- Le tirage ne se fait qu'avec les joueurs présents. Après le tirage : remplacement depuis la liste d'attente, sinon forfait (score par défaut réglable).
- Élimination directe avec un nombre qui n'est pas une puissance de 2 : compléter par la liste d'attente, byes tirés au sort, ou tour préliminaire. En ligue : tournoi à la ronde avec repos tournant.
- Le tirage est vérifiable : la graine aléatoire est enregistrée et publiée.

## D11. Nom, marque et non-affiliation

Nom : **i-am-in** (identifiant technique `iamin`). Aucun logo, nom de marque ou élément graphique de Plato n'est utilisé. Mention « non affilié à Plato » sur les pages publiques.

## D12. Direction visuelle « pendule »

Boîtier bleu nuit, écran LCD à points rétroéclairé pour les scores (police Doto), touches larges, thèmes sombre et clair. Une seule couleur chaude (ambre) pour ce qui est en direct ou en attente. Aucun statut porté par la couleur seule. Maquettes dans l'artefact de design ; les jetons sont repris dans `apps/web`.

## D13. Authentification : sessions côté serveur, sans e-mail

- **Sessions en base** : jeton aléatoire de 256 bits dans un cookie `httpOnly` (`__Host-` avec HTTPS, `SameSite=Lax`), seule son empreinte SHA-256 est stockée. Durée absolue de 7 jours, jeton neuf à chaque connexion, révocables (déconnexion, changement ou réinitialisation de mot de passe).
- **Mots de passe** : argon2id (19 Mio, 2 itérations, 1 voie, valeurs OWASP), 12 caractères au minimum sans règle de composition.
- **CSRF** : deux couches. L'en-tête `Origin`, s'il est présent, doit être celui de l'interface ; toute écriture authentifiée doit renvoyer le jeton propre à la session (`x-csrf-token`).
- **Pas d'e-mail dans la version 0.1.0** : minimisation des données (RGPD) et aucun service d'envoi à exploiter. Le contact passe par Plato : le propriétaire reçoit un ticket, vérifie l'identité via le pseudo Plato, puis transmet un lien de réinitialisation (une heure, usage unique).
- **Invitations** : lien à usage unique de 7 jours, jeton stocké haché. Le propriétaire invite des super admins (D22) ; ceux-ci invitent les admins de leurs groupes (PR 7).
- **Limites de débit** : par adresse IP sur les routes sensibles, et par compte (10 échecs en 15 minutes) pour les attaques réparties. Compromis assumé : on peut bloquer un compte 15 minutes en s'y trompant exprès. État en mémoire, donc une seule instance d'API (à revoir sinon).
- **Premier compte** : le propriétaire se crée en ligne de commande (`create-owner`), mot de passe par variable d'environnement, jamais par argument.

## D14. Groupes : le rôle est porté par l'appartenance

- **Deux niveaux de rôle** : sur la plateforme (`PLATFORM_OWNER` ou `MEMBER`) et dans chaque groupe (`SUPER_ADMIN` ou `ADMIN`, table `GroupMember`). Un compte peut être super admin d'un groupe et simple admin d'un autre. Cela remplace les rôles globaux de D13 (migration cassante, sans conséquence avant la mise en ligne).
- **Seule porte d'entrée vers les données d'un groupe : `GroupGuard`.** Le groupe est lu dans le chemin (`/groups/:groupId/…`), jamais dans le corps de la requête, et l'appartenance est vérifiée à chaque appel : retirer un membre lui ferme l'accès immédiatement, sans attendre la fin de sa session.
- **404 uniforme** : un compte qui n'est pas membre reçoit exactement la même réponse que pour un groupe inexistant ou un identifiant mal formé. Impossible de deviner quels groupes existent. Un membre dont le rôle ne suffit pas reçoit 403.
- **Le propriétaire de la plateforme** voit la liste de tous les groupes et peut réinviter un super admin dans un groupe (assistance), mais ne lit pas les données internes des groupes : `allowOwner` est un choix explicite par route. ~~Il crée les groupes~~ : remplacé par D22.
- **Personne ne s'attribue un rôle supérieur** : un super admin n'invite que des admins ; seul le propriétaire invite un super admin. Une invitation vise un groupe et un rôle précis, et ne sert qu'une fois.
- **Un compte existant rejoint un autre groupe** avec `POST /invitations/join` (session ouverte), sans créer de second compte.
- **Règle pour les PR suivantes** : toute route qui touche aux données d'un groupe (tournois, inscriptions, matchs…) passe par `GroupGuard` et s'accompagne d'un test d'accès croisé.

## D15. Tournois et inscriptions

- **Un tournoi appartient à un groupe.** Les routes d'administration sont `/groups/:groupId/tournaments/…` ; `@GroupAccess` est posé sur la classe du contrôleur (une route ajoutée plus tard est protégée par défaut) et `allowOwner` reste faux. Chaque requête de service filtre par `groupId` ET par identifiant de tournoi : l'identifiant d'un tournoi ou d'une inscription d'un autre groupe est introuvable, même via son propre groupe.
- **Inscription publique, validation manuelle (D9).** Le lien public du tournoi (identifiant aléatoire de 128 bits) ne donne que le droit de s'inscrire. Le joueur est « en attente » ; un admin le valide, ce qui le place « accepté » s'il reste de la place, sinon en « liste d'attente ». Au plus 200 inscriptions en attente par tournoi, et 10 inscriptions par minute et par adresse IP (R8).
- **Lien personnel du joueur** : jeton de 256 bits, montré une seule fois, seule son empreinte est stockée. Il est envoyé dans l'en-tête `x-player-token`, jamais dans l'URL, donc absent des journaux d'accès. Il permet de voir son statut (jamais les autres inscrits) et d'annuler.
- **Retirer ou annuler supprime la ligne** (minimisation RGPD) ; la promotion du premier de la liste d'attente est automatique, dans l'ordre de validation. Un pseudo ne s'inscrit qu'une fois par tournoi, sans tenir compte de la casse.
- **Concurrence** : toute écriture qui touche aux places verrouille la ligne du tournoi (`SELECT … FOR UPDATE`) dans la transaction, comme D5 le prévoit pour les matchs : deux validations simultanées ne dépassent jamais la capacité. Réduire les places sous le nombre d'acceptés est refusé (409) ; les augmenter promeut la liste d'attente.
- **Pointage** (présent / absent) : seulement pendant la phase `CHECK_IN`, seulement pour les joueurs acceptés.

## D16. Tirage, scores, forfaits et remplacements

- **Le serveur tire, avec sa propre graine.** Le tirage ne concerne que les joueurs acceptés ET présents (D10), exige la phase de pointage et au moins 2 joueurs, et ne se fait qu'une fois. La graine (128 bits) est choisie par le serveur : un admin ne peut pas essayer des graines jusqu'à obtenir le tirage voulu (R11). Elle est publiée avec la liste triée des joueurs (`initialPlayers`) : n'importe qui peut refaire le tirage avec le moteur et comparer.
- **Phases** : `REGISTRATION` ↔ `CHECK_IN` (réversibles) → `STARTED` (tirage) ↔ `FINISHED` (champion connu, ou tous les matchs de la ligue joués ; recalculé à chaque score, donc un score corrigé rouvre le tournoi). Après le tirage, inscriptions, retraits, pointage et places sont figés ; seuls le nom et le score de forfait restent modifiables.
- **Le moteur reste la source de vérité.** La structure calculée (tableau ou calendrier) est stockée en JSON dans le tournoi ; les scores sont dans `MatchResult` (un par code de match). Classement, avancement des vainqueurs et champion sont recalculés par le moteur à chaque lecture, jamais stockés.
- **Scores** : entiers de 0 à 99, pas d'égalité. Un forfait donne au vainqueur le « score de forfait » du tournoi (1 par défaut, réglable), 0 au forfait. En élimination, un score est refusé tant que le match n'a pas ses deux joueurs, et pour un bye. Changer le vainqueur d'un match (ou annuler son score) est refusé si le match suivant a déjà un score : on corrige dans l'ordre inverse. En ligue, tout se corrige librement.
- **Remplacement** : un joueur du tirage qui n'a joué aucun match peut être remplacé par un joueur accepté ou en liste d'attente. La graine et la liste d'origine ne changent pas ; le joueur remplacé reste listé (`REPLACED`) pour l'historique. Le remplaçant doit appartenir au même tournoi : l'identifiant d'un joueur d'un autre tournoi est introuvable.
- **Ligue bornée à 32 joueurs** (496 matchs) pour garder un calendrier lisible ; aller-retour en option (`legs: 2`).
- **Concurrence** : mêmes verrous de ligne que D15 ; deux scores saisis simultanément sont appliqués l'un après l'autre. Le relais (D17) décide qui a le droit d'écrire.
- **Le moteur est une dépendance de l'API** (`workspace:*`). Son `dist` est construit à l'installation et au début de `pnpm check`.

## D17. Relais entre admins et journal d'événements

- **Un seul admin écrit par tournoi (D5).** Le créateur « tient la main » ; toute écriture sur le tournoi (réglages, inscriptions, pointage, tirage, scores, remplacements) exige d'être le détenteur, vérifié DANS la transaction, après le verrou de ligne : une requête qui arrive juste après un changement de main est refusée (403). Les autres admins du groupe lisent le tournoi, le tirage et le journal.
- **Passer le relais** : le détenteur propose à un autre admin DU GROUPE (un admin d'un autre groupe est introuvable), qui doit accepter ; rien ne change avant son accord. Il peut refuser, et le détenteur peut annuler. Le détenteur peut aussi rendre la main : personne n'écrit alors, et n'importe quel admin du groupe peut la prendre.
- **Reprise par le super admin** : à tout moment, même si quelqu'un la tient (détenteur injoignable). C'est tracé (`RELAY_RECLAIMED`). Le propriétaire de la plateforme n'y a pas accès.
- **Un admin retiré du groupe** perd la main et les propositions qui le visent, dans la même transaction que son retrait.
- **Version des scores** : chaque score porte une `version` ; si l'écran envoie celle qu'il affichait et qu'elle est périmée, la saisie est refusée (409) au lieu d'écraser un score plus récent. Facultatif, car le détenteur est seul à écrire.
- **Journal** (`TournamentEvent`) : qui (compte), quoi (type), quand, charge. Ajouté dans la transaction du changement : pas de changement sans trace, pas de trace d'un changement refusé ou annulé. Lecture paginée du plus récent au plus ancien, ouverte à tout admin du groupe.
- **Minimisation** : la charge ne contient que des identifiants, des codes de match et des scores, jamais un pseudo de joueur. Annuler ou retirer un joueur ne laisse donc aucune donnée personnelle dans le journal. Si un compte admin est supprimé, l'auteur de ses événements devient « inconnu ».

## D18. Page publique et direct (SSE)

- **Deux routes publiques, en lecture seule**, trouvées par le lien du tournoi : `GET /public/tournaments/:slug/view` (inscrits validés, tableau ou calendrier et classement, graine et liste du tirage) et `GET /public/tournaments/:slug/live` (flux SSE). Aucune écriture. Elles ne montrent ni les inscriptions en attente, ni les jetons, ni le détenteur de la main, ni les versions de score, ni l'identifiant du groupe.
- **Le serveur surveille le journal, pas les services d'écriture.** Chaque changement inscrit un événement dans sa transaction (D17) : compter les événements validés suffit à détecter un changement. Aucune annonce avant la validation (un spectateur qui recharge voit déjà le changement), rien à ajouter dans les services d'écriture, et cela fonctionne avec plusieurs instances d'API, ce que D7 réservait à `LISTEN/NOTIFY`. Coût : une requête de comptage par seconde et par tournoi regardé (pas par spectateur), latence d'une seconde au plus.
- **Le message ne contient que la révision** (nombre d'événements). Le client recharge `view`, dont la révision est lue AVANT la vue : si elle est plus petite que celle annoncée, il sait qu'il doit relire. Repli du client : relire `view` toutes les 10 s si le flux est coupé.
- **Plafonds (R17)** : 500 flux ouverts au total, 200 par tournoi (503 au-delà), 20 ouvertures par minute et par IP, 60 lectures de `view`. Une connexion se ferme d'elle-même après 30 minutes (le navigateur se reconnecte seul) et un message de maintien part toutes les 25 s.
- **Visibilité** : un inscrit validé apparaît sous son pseudo Plato sur la page publique ; un inscrit en attente jamais. Annuler ou retirer un joueur le retire de la page à la lecture suivante.

## D19. Interface admin (apps/web)

- **React 19 + Vite, mobile d'abord** : la maquette est un téléphone (390 px). Routes : connexion, tournois du groupe, création, puis un écran par tournoi avec les onglets Inscrits, Pointage, Tirage, En jeu, Journal, et « Copier pour le chat ». Les données du serveur passent par TanStack Query (relues après chaque écriture et toutes les 5 s : un autre admin peut avoir changé quelque chose) ; l'état d'interface reste local.
- **Jetons de design** repris tels quels de la maquette (`tokens.css`, thèmes sombre et clair, écran LCD toujours sombre). Les polices (Barlow, Barlow Condensed, Doto) sont **servies par l'application** (`@fontsource`), pas par Google Fonts : aucune requête vers un tiers, donc pas d'adresse IP de l'admin envoyée ailleurs (RGPD) et une future CSP plus stricte.
- **Authentification côté navigateur** : le cookie de session est `httpOnly` (invisible pour le JavaScript) ; le jeton CSRF est gardé **en mémoire seulement**, redemandé à `/auth/me` au rechargement. Rien de secret dans `localStorage` (seulement le thème et le dernier groupe).
- **Lecture seule sans la main** (D5, D17) : tous les boutons d'écriture sont désactivés quand on ne tient pas la main, et l'écran dit pourquoi. L'API reste la seule autorité (elle répond 403) ; l'interface ne fait qu'éviter l'erreur.
- **Texte du chat** : produit par `@iamin/engine` (pseudos nettoyés), jamais recomposé côté interface. Le moteur est une dépendance CommonJS : `vite.config.ts` le convertit.
- **Pas de HTML injecté** : React échappe tout ; aucun `dangerouslySetInnerHTML` (R10).
- **Hors périmètre de cette PR** : page publique d'inscription et PWA installable (PR 13), CSP et hébergement (PR 14), invitations d'admins par l'interface.

## D20. Page publique et PWA installable

- **Une seule page pour le joueur, `/t/:slug`** : sans compte, elle montre le tournoi (inscrits validés et liste d'attente avant le tirage ; tours, scores, classement et graine après), le formulaire d'inscription tant qu'elles sont ouvertes, et l'inscription du joueur. Elle réutilise les composants de l'admin (tours, fiches de match, classement), sans aucun bouton d'écriture : la lecture seule vient de l'API (D18), pas d'un masquage.
- **Le lien personnel du joueur reste sur son appareil** (`localStorage`, une clé par tournoi) pour qu'il retrouve son statut en revenant, et part uniquement dans l'en-tête `x-player-token` (jamais dans l'adresse, D15). Ce n'est pas un secret de compte : il ne permet que de voir et d'annuler cette inscription. Un lien périmé (inscription refusée ou supprimée par un admin) est oublié tout seul. Si l'appareil perd le lien, le joueur prévient un admin : aucun moyen de le retrouver, par choix (pas de compte, pas d'e-mail).
- **Direct** : la page ouvre le flux SSE de D18 et relit la vue ET l'inscription du joueur à chaque message `changed` ; repli toutes les 20 s si le flux est coupé. L'indicateur « EN DIRECT » n'apparaît que flux ouvert.
- **Lien à partager côté admin** : l'onglet Inscrits affiche l'adresse `/t/<lien>` avec un bouton « Copier le lien ».
- **PWA sans plugin** : un manifeste, des icônes (192, 512, maskable, iOS) et un service worker de 60 lignes dans `public/`. Pas de `vite-plugin-pwa` : une dépendance de moins à auditer, et le besoin est simple. Le service worker garde la **coquille** (page, scripts, styles, polices, icônes) : réseau d'abord pour les pages (toujours la dernière version), cache d'abord pour les fichiers à empreinte. Il ne traite **que la même origine** et exclut `/api/` (D21 : en production l'API est sur la même origine, sous `/api`) : jamais de donnée de tournoi, de session ni de jeton dans le cache. Hors ligne, l'application s'ouvre et dit que le serveur est injoignable. Enregistré en production seulement.
- **CORS** : `x-player-token` rejoint la liste des en-têtes autorisés (`content-type`, `x-csrf-token`). Oublié d'abord : l'inscription passait mais la lecture du statut échouait dans le navigateur. Les tests d'API n'envoient pas d'`Origin`, donc seul l'essai réel l'a vu ; un test de préambule CORS le garde.
- **À l'hébergement** : `sw.js` servi avec `Cache-Control: no-cache` et le manifeste avec son type `application/manifest+json` : fait dans le Caddyfile (D21).
- **Hors périmètre** : notifications (0.2.0), invitations d'admins par l'interface, page d'accueil publique (un visiteur sans lien arrive sur la connexion admin).

## D21. Déploiement : Docker, Caddy, une seule origine

- **Cible** : un serveur Linux avec Docker et un nom de domaine, rien d'autre (pas de plateforme dépendante d'un fournisseur). `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` démarre tout. Le Compose de production a son propre nom de projet (`iamin-prod`) : il ne touche jamais à la base de développement.
- **Quatre services** : `db` (PostgreSQL, sans port publié), `migrate` (applique les migrations versionnées puis s'arrête), `api` (démarre seulement après le succès de `migrate` et la santé de `db`), `web` (Caddy : interface, relais `/api`, HTTPS). Seul Caddy publie des ports, 80 et 443.
- **Une seule origine** : l'interface est servie par Caddy et l'API sous `/api` (préfixe retiré avant le relais). Conséquences : aucun CORS à ouvrir en production, un seul nom de domaine, cookie `__Host-` valable (il exige l'origine exacte, sans `Domain`), `WEB_ORIGIN` = `https://<domaine>`. L'interface est construite avec `VITE_API_URL=/api`.
- **HTTPS automatique** : Caddy obtient et renouvelle seul les certificats (Let's Encrypt). Les certificats vivent dans un volume à conserver. HSTS d'un an avec sous-domaines : à ne pas activer sur un domaine dont d'autres sous-domaines restent en HTTP.
- **CSP stricte** (R23) : `default-src 'none'` puis seulement `'self'` pour scripts, styles, polices, connexions (API et flux SSE compris), manifeste et service worker ; `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`. Ni script ni style en ligne, aucun domaine tiers (les polices sont servies par l'application, D19). Essayée dans un navigateur : elle a révélé que Vite intégrait les petites polices en `data:` ; `assetsInlineLimit: 0` les garde en fichiers plutôt que d'assouplir la CSP. Autres en-têtes : HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy` fermée, `Cross-Origin-Opener-Policy`.
- **Proxy de confiance** (R22) : sans réglage, l'API voit l'adresse de Caddy pour tous les visiteurs, donc les limites de débit (connexion, inscriptions, flux en direct) compteraient un seul « visiteur ». `TRUST_PROXY=1` (0 par défaut, 5 au plus) fait lire l'adresse vue par Caddy. Jamais un en-tête du visiteur : Caddy remplace `X-Forwarded-For` d'un client non fiable.
- **Images** : un `Dockerfile` à la racine, trois cibles. `api` : dépendances de production seulement, client Prisma généré, utilisateur `node`, sonde de santé sur `/health` ; Compose le lance en lecture seule, sans capacité Linux, sans élévation de privilèges. `prisma` passe en dépendance de production : il génère le client dans l'image et applique les migrations au déploiement (son audit est couvert par `pnpm audit --prod`). `web` : Caddy + fichiers construits. `pnpm deploy` a été essayé puis écarté : il relance les scripts de la racine et perd le client Prisma généré.
- **Cache** : `/assets/*` (noms à empreinte) un an, `immutable`, et un fichier manquant répond 404 (jamais `index.html` : un ancien client y trouverait du HTML à la place d'un script, gardé un an) ; `sw.js`, `index.html` et le manifeste se revalident toujours ; les erreurs ne se gardent jamais. Les adresses inconnues rendent `index.html` (application d'une seule page).
- **Aucun journal d'accès** : Caddy n'écrit que ses erreurs, donc aucune adresse IP n'est conservée (RGPD). Rotation des journaux des conteneurs : 3 fichiers de 10 Mo.
- **Sauvegardes** : `deploy/backup.sh` (`pg_dump` compressé, fichier temporaire puis renommé, `umask 077`, 30 jours de conservation) et `deploy/restore.sh` (arrête l'API, restaure, relance, demande confirmation). Restauration essayée pour de vrai : 1 compte, 0 après suppression, 1 après restauration. Copie hors du serveur et chiffrement : à la charge de l'exploitant, documentés dans le README.
- **CI** : un job construit les deux images, valide le Compose de production et la syntaxe des scripts. Dependabot suit désormais aussi les images de base (Node, Caddy).
- **Hors périmètre** : choix de l'hébergeur et du nom de domaine, supervision, sauvegarde automatique hors serveur, mises à jour sans interruption (un `up -d --build` coupe quelques secondes).

## D22. Le super admin crée ses groupes

- **Qui fait quoi** : le propriétaire de la plateforme ne fait que **valider les super admins** en leur envoyant un lien d'invitation. Seul un super admin crée un groupe, dont il devient le super admin ; il invite ensuite les admins. Le propriétaire ne crée plus de groupe (`POST /groups` lui répond 403).
- **Un rôle de plateforme de plus** : `GROUP_CREATOR` (affiché « super admin ») à côté de `PLATFORM_OWNER` et `MEMBER`. Il donne un seul droit : créer des groupes. Les droits dans un groupe restent portés par l'appartenance (D14) : un super admin n'a aucun accès au groupe d'un autre super admin.
- **Invitation sans groupe** : `groupId` et `groupRole` sont tous deux vides (contrainte `CHECK` en base : jamais l'un sans l'autre). Routes du propriétaire : `POST`, `GET` et `DELETE /creator-invitations`. Le lien suit les règles de D13 (7 jours, un usage, jeton haché, montré une fois). Un compte déjà connecté peut l'utiliser (`POST /invitations/join`) et devient alors super admin ; le propriétaire et un super admin déjà validé sont refusés (409), sans consommer le lien.
- **Plafond** : 5 groupes par super admin (`MAX_GROUPS_PER_CREATOR`), vérifié dans la transaction avec un verrou sur la ligne du compte : des créations simultanées ne le dépassent pas (testé). C'est le garde-fou contre l'abus d'un compte validé.
- **Pseudo Plato imposé** (PR 17) : le propriétaire indique le pseudo de la personne invitée, obligatoire pour un super admin et facultatif pour un admin. Il est imposé à la création du compte (le serveur refuse tout autre pseudo, casse ignorée) ; un compte déjà connecté ne peut utiliser un lien nominatif que si son pseudo Plato est le même (403 sinon, lien non consommé). La page du lien le demande à POST /invitations/preview (en POST : le jeton ne passe jamais dans une adresse), qui répond comme ccept à un jeton inconnu, expiré ou utilisé. Le pseudo apparaît dans la liste des invitations en attente. Le pseudo ne protège pas un lien qui fuit : le jeton reste la protection.
- **Assistance conservée** : le propriétaire peut toujours réinviter un super admin dans un groupe existant (D14), par exemple si son créateur a perdu son compte.
- **Interface** : le propriétaire invite depuis l'onglet Moi, le super admin crée ses groupes et invite ses admins depuis l'onglet Groupe, et la page `/invitation/<jeton>` crée le compte (ou rejoint avec le compte connecté).
- **Garde-fous** : `route-policy.test.ts` vérifie que `POST /groups` exige `GROUP_CREATOR` et que les routes `/creator-invitations` exigent le propriétaire.

## D23. Retours des utilisateurs

- **Qui écrit** : tout le monde. Un admin connecté écrit avec son compte (`POST /feedback`, limité à 5 par minute), un joueur sans compte écrit anonymement (`POST /public/feedback`, limité à 3 par minute et par adresse). Un pseudo Plato de contact est facultatif et seulement proposé aux joueurs sans compte.
- **Ce qu'on envoie** : un type (idée, amélioration, bug, autre) et un message de 2 000 caractères au plus ; les retours à la ligne sont gardés, tout autre caractère de contrôle ou invisible est refusé.
- **Qui lit** : le propriétaire de la plateforme seulement (`/retours`, onglet Moi) : filtre par statut (nouveau, lu, traité), changement de statut, suppression, purge. Les super admins et les admins ne voient aucun retour, pas même les leurs. Gardé par `route-policy.test.ts`.
- **Pas d'e-mail** (D13) : pas de notification ni de réponse automatique. Le propriétaire répond, s'il le souhaite, par Plato avec le pseudo laissé.
- **Protection** : limite de débit, plafond de 500 retours non traités pour les envois anonymes (503 au-delà, les admins ne sont pas concernés), message affiché comme du texte (testé avec du HTML) : risque R30.
- **Conservation** (RGPD, traitement 6) : un retour traité depuis plus d'un an est supprimé par le bouton « Purger » du propriétaire. Il n'y a pas de tâche planifiée : la purge est manuelle, à faire au moins une fois par an. Supprimer un compte admin garde ses retours, sans auteur.
- **Hors périmètre** : réponse aux utilisateurs dans l'application, votes, vues publiques des retours (feuille de route 0.6.0).

## D24. Double authentification du propriétaire (TOTP)

- **Pourquoi** : le compte propriétaire émet les liens de réinitialisation de mot de passe de tous les autres comptes et invite les super admins ; son vol (mot de passe seul) donnerait la main sur tous les comptes. Une seconde preuve est donc obligatoire pour lui, facultative pour les autres comptes (R28).
- **Quoi** : TOTP (RFC 6238, 6 chiffres, 30 s, SHA-1 : lu par toutes les applications), bibliothèque `otpauth`. Un e-mail comme second facteur a été écarté : il dépend de la sécurité de la boîte de réception, contredit D13 (aucun e-mail) et ajoute un secret d'envoi sur le serveur.
- **Secret** : chiffré en base (AES-256-GCM, nonce neuf, étiquette d'authentification) avec `TOTP_ENCRYPTION_KEY`, obligatoire en production (64 caractères hexadécimaux, refusée si mal formée, jamais affichée). Une copie volée de la base ne suffit pas à générer des codes. Hors production, une clé publique de repli sert, sans aucune protection.
- **Connexion en deux étapes** : le mot de passe donne un jeton d'étape (5 minutes, 5 essais, empreinte en base), **pas une session** : aucun cookie, aucun droit. Le code donne la session. Un code ne sert qu'une fois (tranche de 30 s mémorisée, mise à jour conditionnelle contre les requêtes simultanées), avec une tranche de tolérance avant ou après. 5 codes faux par compte en 15 minutes bloquent le compte (HTTP 429).
- **Codes de secours** : 10 codes à usage unique (`xxxxx-xxxxx`), affichés une seule fois, stockés hachés ; en régénérer exige un code valide et annule les anciens.
- **Obligatoire pour le propriétaire** : sans double authentification active, toutes ses routes sont fermées (403 `MFA_ENROLLMENT_REQUIRED`) sauf celles qui servent à l'activer, à se déconnecter et à savoir qui il est ; l'interface le dirige vers l'écran Sécurité. Il ne peut pas la désactiver par l'application. Activer ferme ses autres sessions.
- **Ressaisie avant les actions sensibles** : après une connexion avec code ou une ressaisie, 10 minutes de confiance (`elevatedUntil` sur la session). Au-delà, `@RequireElevation()` refuse (403 `ELEVATION_REQUIRED`) : inviter ou annuler l'invitation d'un super admin, émettre ou clore un ticket de réinitialisation, supprimer un retour, purger. Lire reste libre. Une session volée ne suffit donc pas pour ces actions. La liste exacte est gardée par `route-policy.test.ts`.
- **Session du propriétaire plus courte** : 12 heures au plus et 30 minutes sans activité (7 jours pour les autres).
- **Perte du téléphone** : un code de secours, sinon, sur le serveur, `create-owner --reset-2fa` (supprime le secret, les codes et ses sessions ; il réactive à la connexion suivante). Perdre `TOTP_ENCRYPTION_KEY` revient au même : tous les secrets deviennent illisibles.
- **Limite connue** : le TOTP ne résiste pas à un faux site qui relaie le code en direct. Les clés d'accès (passkeys) sont la suite prévue.
- **Hors périmètre de cette PR** : verrouillage par adresse + compte (R25), écran de sessions actives et journal de sécurité, mot de passe de 16 caractères, alertes par e-mail.

## D25. Verrouillage par adresse, sessions actives et journal de sécurité

- **Verrouillage** (R25) : deux compteurs en mémoire, 15 minutes. Par **compte et adresse** : 10 échecs bloquent cette adresse sur ce compte, et seulement elle (un tiers qui s'acharne se bloque lui-même, le titulaire se connecte depuis une autre adresse). Par **compte seul** : 50 échecs, toutes adresses confondues, bloquent le compte pour tous (une attaque répartie sur beaucoup d'adresses s'arrête quand même). Un succès ne remet à zéro que le compteur de son adresse, pas celui des autres. Le blocage ne change rien à ce que la réponse révèle (un compte inconnu reste indiscernable d'un mauvais mot de passe).
- **Sessions actives** : `GET /auth/sessions` liste les sessions du compte avec leur appareil et leurs dates, et repère celle en cours ; `DELETE /auth/sessions/:id` ferme une autre session (jamais la sienne, jamais celle d'un autre compte : 404) ; `POST /auth/sessions/close-others` ferme toutes les autres. Écran Sécurité.
- **Appareil lisible** : « Chrome · Windows », déduit de l'en-tête `User-Agent` par `deviceLabel` ; ni le texte brut (qui identifie un appareil précis) ni l'adresse IP ne sont stockés (RGPD, traitement 1).
- **Journal de sécurité** : par compte, lisible par son titulaire seul (`GET /auth/activity`, 40 derniers événements), conservé 30 jours, purgé toutes les heures. Événements : connexion réussie, mot de passe faux, code faux, compte bloqué, double authentification activée, code de secours utilisé ou régénéré, mot de passe changé ou réinitialisé, **lien de réinitialisation émis pour ce compte** (le titulaire voit que le propriétaire en a émis un), sessions fermées, super admin invité. Les échecs ne s'écrivent qu'une fois par 10 minutes : un robot ne remplit pas la base. Écrire dans le journal ne peut jamais empêcher la connexion qu'il décrit. Pas d'alerte par e-mail (D13) : c'est au titulaire de regarder, l'écran signale « à vérifier » les événements suspects.
- **Mot de passe du propriétaire** : 16 caractères au moins et sans son identifiant, à la création (`create-owner`) et au changement (les autres comptes gardent 12). Pas de liste de mots de passe courants : je n'embarque pas une liste que je ne peux pas garantir à jour.
- **Hors périmètre** : alertes par e-mail, verrouillage partagé entre plusieurs instances (R26), clés d'accès (passkeys).

## D26. Mise en page ordinateur et téléphone

- **Deux usages, une seule interface** : le téléphone (PWA) garde la barre du bas et une colonne de 520 px, inchangés ; à partir de **960 px** de large, l'interface passe en mise en page ordinateur. Pas de seconde application ni de détection d'appareil : uniquement des media queries, donc une fenêtre réduite redevient une application mobile.
- **Barre latérale** (252 px) au lieu de la barre du bas : la marque, les trois entrées du téléphone, puis des entrées réservées à l'ordinateur (Sécurité ; Super admins et Retours pour le propriétaire) et le compte connecté en bas. Ces entrées en plus n'existent pas sur téléphone : leurs écrans restent joignables par l'onglet Moi.
- **Cadre commun** : en-tête, onglets, bandeau « la main » et contenu partagent la même largeur (1180 px au plus) et la même marge de gauche. Les écrans de lecture et les formulaires gardent une colonne de 780 px.
- **Écrans de travail** : liste des tournois et boîte de retours en grille de cartes ; Inscrits, Groupe et En jeu en deux colonnes (liste à gauche, partage, ajout, invitation ou classement à droite, `.desk-grid`) ; matchs d'un tour en cartes côte à côte ; pointage sur deux colonnes ; sécurité en panneaux. Sans colonne de droite, la colonne de gauche ne s'étire pas (`:has`).
- **Feuille de saisie du score** : tiroir collé en bas sur téléphone, fenêtre centrée sur ordinateur.
- **Page publique des joueurs** : colonne centrée de 640 px (elle reste pensée pour le téléphone).
- **Vérifié** dans le navigateur sur de vraies données de démonstration (élimination, ligue, inscriptions ouvertes) à 1100 px et à 375 px.
- **Hors périmètre** : mise en page tablette dédiée (entre 520 et 960 px la colonne mobile est centrée), thème clair relu écran par écran, raccourcis clavier.

## D27. Langues de l'interface : français, anglais, espagnol

- **Pourquoi** : Plato est mondial et ses serveurs sont par langue ; les joueurs les plus nombreux parlent français, anglais, espagnol et arabe. On commence par trois langues qui s'écrivent de gauche à droite ; l'arabe (de droite à gauche) demande une mise en page inversée et vient ensuite, puis le persan et l'ourdou, qui ne sont pas de l'arabe mais s'écrivent comme lui.
- **Pas de bibliothèque** : un catalogue maison (`lib/i18n`). Chaque texte est un **triplet** `[français, anglais, espagnol]` rangé par écran dans `messages/*.ts` : un texte sans ses trois langues ne compile pas (`defineMessages`). Les clés sont typées (`MessageKey`), les paramètres s'écrivent `{nom}`, les nombres passent par `Intl.PluralRules` (clés `…_one` / `…_other`), les dates par `Intl`.
- **Garde-fous** (`i18n.test.tsx`) : aucun texte vide, aucune clé en double entre deux fichiers, mêmes `{paramètres}` dans les trois langues, chaque pluriel a ses deux formes, et un texte long n'est pas la copie du français.
- **Choix de la langue** : le choix de la personne (écran Moi, gardé dans `localStorage`, clé `iamin-lang`, aucune donnée personnelle) passe avant la langue par défaut de l'écran (celle d'un tournoi, PR suivante), avant la langue du navigateur, avant le français. `<html lang>` suit.
- **Sans fournisseur** (tests, composants isolés) : le français.
- **Noms des langues** : chacune s'écrit dans sa propre langue (« Español »), pour se retrouver sans lire la langue actuelle.
- **Langue d'un tournoi** (PR 23) : l'admin la choisit à la création (par défaut la langue de son écran) et la change quand il veut, même après le tirage (`Tournament.language`, `PATCH`, détenteur seulement). Elle fixe la langue de la **page des joueurs** et du **texte du chat** : les joueurs lisent le chat de leur serveur Plato, pas l'écran de l'admin. Sur la page publique, le joueur peut changer de langue pour lui-même ; son choix reste sur son appareil et n'est jamais envoyé au serveur. Ordre sur cette page : choix du joueur, langue du tournoi, navigateur, français.
- **Texte du chat** : le moteur (`@iamin/engine`) écrit les messages en français, anglais ou espagnol (paramètre `locale`, français par défaut : l'ancien appel ne change pas). Le menu « Copier pour le chat » reste dans la langue de l'écran, le message copié dans celle du tournoi, et l'écran le dit.
- **Messages d'erreur de l'API** (PR 24) : l'interface envoie `Accept-Language` (la langue de l'écran, ou celle de la page d'un tournoi) à chaque appel ; un filtre d'exceptions (`LocalizedExceptionFilter`) traduit le corps de la réponse avant de l'envoyer : `message`, et `errors[].message` pour les champs de formulaire. Le statut, `code` (ex. `ELEVATION_REQUIRED`) et le nom des champs ne changent jamais. Les 98 messages (API, moteur) sont dans `i18n/catalog.ts`, en français (texte exact du code), anglais, espagnol ; les valeurs variables s'écrivent `{n}` et sont reprises dans la phrase traduite. Aucun site d'appel n'a changé : le français du code sert de clé. Un message hors catalogue sort tel quel, jamais une erreur à cause d'une traduction.
- **Garde-fou** (`i18n/i18n.test.ts`) : le test lit le code de l'API et du moteur ; un message d'exception, de validation ou une constante-message ajouté sans traduction fait échouer la CI, et une ligne du catalogue sans message correspondant aussi (pas de texte mort).
- **Découverte** : la limite de débit renvoyait « ThrottlerException: Too Many Requests » en anglais brut à tout le monde ; elle est ramenée à la phrase du catalogue.
- **Langue des codes** : `code` et les clés de réponse restent en anglais technique, lus par le programme et jamais affichés.
- **Qualité des traductions** : écrites par moi, à faire relire par une personne qui parle la langue avant d'ouvrir au public (surtout l'espagnol, visible dans les messages du chat).

## D29. Vainqueur sans score, matchs nuls, étapes qui s'enchaînent, journal lisible

- **Élimination directe : le vainqueur, pas le score.** L'admin désigne le gagnant d'un geste (deux gros boutons « X gagne », un forfait, une annulation). L'API accepte `{ winner: 'a' | 'b' }` ou un forfait et refuse un score (400). En interne le moteur garde 1-0 ou 0-1 pour faire avancer le tableau ; ce faux score n'est jamais affiché ni écrit au journal (qui note `winner`) ni dans le chat (« X bat Y »). Les écrans (admin et page publique) marquent le gagnant d'une coche. Un forfait garde son score par défaut, caché de la même façon.
- **Ligue : le score, et le nul selon le jeu.** `Tournament.allowDraws` (faux par défaut), choisi par le créateur **à la création** (« Matchs nuls : impossibles / autorisés », avec une phrase d'explication), modifiable tant que le tirage n'est pas fait. En élimination le choix n'existe pas : toujours faux, et une demande contraire est refusée. Quand le nul est refusé, un score à égalité l'est aussi (400). Quand il est autorisé : 1 point chacun (réglable dans le moteur, `pointsForDraw`), un compteur de nuls dans le classement (colonne V-N-D, seulement s'il y en a), « match nul » dans le chat et dans les textes en trois langues. Les confrontations directes comptent aussi les nuls.
- **Enchaînement des étapes.** (1) Pointage terminé (plus personne « à pointer ») : un bandeau annonce le tirage et y mène après 3 s, avec « Y aller » et « Rester ici » ; il ne s'arme qu'après un pointage fait sur l'écran, jamais en ouvrant l'onglet. (2) Tirage fait : l'écran passe directement aux matchs. (3) Un tour terminé : l'écran passe au tour suivant avec une transition douce (désactivée si la personne réduit les animations) et une phrase (« Demi-finales : tous les matchs sont joués. Suite : Finale. ») ; si la personne regardait un autre tour, rien ne bouge. La page des joueurs suit le jeu de la même façon tant qu'ils n'ont pas choisi de tour. (4) Tournoi terminé : une carte annonce le vainqueur (ou le premier de la ligue) et propose de copier les résultats pour le chat. L'onglet Tirage, une fois le tirage fait, n'est plus qu'un résumé : « Voir les matchs », et la graine et l'ordre repliés dans « Détails du tirage ».
- **Journal lisible, avec l'auteur.** Chaque ligne a un titre, une famille (couleur), une phrase avec les noms (« Demi-finales, match 1 : naruto bat sasuke », « sasuke : présent », « alice → adam »), l'heure, les titres de jour (Aujourd'hui, Hier, la date), et l'admin qui a agi (« par alice », avatar). Un joueur qui s'inscrit seul est « le joueur lui-même » ; un admin supprimé depuis, « un admin supprimé ». La charge enregistrée ne change pas (identifiants seulement, D17) : l'API retrouve les noms **à la lecture** (`refs` : joueurs de ce tournoi, comptes cités) ; un joueur supprimé n'a plus de nom (« joueur retiré »). Les noms des matchs viennent du tirage affiché.
- **Hors périmètre** : barème des points de nul réglable depuis l'écran, nul en élimination (prolongation, tirs au but), retour automatique aux inscrits quand le tournoi se remplit.

## D28. Journal : tout événement, toute erreur, retrouvables

- **Pourquoi** : en production une erreur doit laisser une trace claire, et avec des milliers de lignes il faut pouvoir retrouver la bonne en quelques secondes. Avant, l'API n'écrivait qu'une ligne au démarrage ; une erreur 500 sortait sans contexte, un refus (401, 403, 429) rien du tout, et un plantage de l'interface chez un joueur ne laissait aucune trace.
- **Format** : une ligne JSON par événement sur la sortie standard (`logging/app-logger.ts`), lue par Docker : `ts`, `level` (debug, info, warn, error), `ctx`, `msg`, puis des champs. Les journaux de Nest (démarrage, routes) passent par le même format. `LOG_LEVEL` règle le niveau (`info` par défaut, `silent` en test).
- **Une référence par requête** : chaque requête reçoit un identifiant (`x-request-id`, ajouté à toutes les lignes écrites pendant la requête grâce à un contexte `AsyncLocalStorage`) et le compte connecté (`userId`, un uuid). L'interface affiche « (réf. 1a2b3c4d) » après une erreur du serveur : c'est ce que la personne nous donne pour retrouver la ligne.
- **Ce qui est écrit** : (1) une ligne de fin par requête (`http.request` : méthode, **route** et non adresse, statut, durée), en `error` pour un 5xx, `warn` pour un 4xx avec le message d'origine (les connexions ratées, droits refusés, limites de débit sont donc visibles) ; la sonde `/health` n'est écrite que si elle échoue ; (2) toute erreur inattendue (`http.error`) avec son nom, son code et sa trace, le visiteur recevant un 500 sans détail ; (3) les événements de sécurité de D25 recopiés (`security.login_failed`, `security.account_locked`…) ; (4) le cycle de vie (`app.started`, `app.stopping`, erreurs fatales, promesses rejetées) ; (5) les erreurs du navigateur (`client.error`) : l'interface les envoie à `POST /public/client-errors` (limitée à 10 par minute, tout borné), via un filet React et les événements `error` et `unhandledrejection`, au plus 5 par chargement de page.
- **Ce qui n'est jamais écrit** (D21, registre RGPD, traitement 7) : adresse IP, agent utilisateur, en-têtes, cookies, mots de passe, jetons, corps de requête, paramètres d'adresse. Les champs dont le nom évoque un secret (`password`, `token`, `cookie`, `csrf`, `totp`, `hash`…) sont masqués d'office ; les erreurs de la base, dont le message recopie la requête et ses valeurs, sont réduites à leur code et à leur cible ; « Cannot GET /… » perd l'adresse ; un saut de ligne dans un texte ne peut pas fabriquer une fausse ligne.
- **S'y retrouver** : `scripts/logs.mjs` lit le journal sur son entrée et filtre : `--level`, `--event` (préfixe : `security.`), `--req`, `--user`, `--route`, `--status` (`500`, `4xx`), `--since 1h`, `--grep`, `--summary` (bilan : niveaux, erreurs les plus fréquentes, routes les plus lentes), `--json` (pour `jq`). Les événements ont des noms stables (`auth`, `security.*`, `http.request`, `http.error`, `client.error`, `app.*`) : c'est le filtre le plus utile.
- **Conservation** : rotation Docker par taille, 5 fichiers de 20 Mo par conteneur ; rien n'est envoyé à un tiers.
- **Première trouvaille du journal** : pendant des essais, la page publique d'un tournoi a ouvert le flux en direct toutes les 5 s (la connexion se fermait aussitôt, Firefox la rouvrait), puis épuisé la limite de débit (20 par minute et par adresse) : neuf refus 429 de suite, visibles d'un coup avec `--route /live`. Le serveur tient pourtant le flux ouvert (essayé en HTTP/1.1 et HTTP/2 avec Node, via Caddy, et dans Chromium) : la cause exacte dans Firefox n'est pas reproduite. Correctif de robustesse : le serveur impose un délai de reconnexion de 15 s (`retry` du protocole SSE) ; la page mène elle-même la reconnexion (attente doublée : 2 s, 4 s… 60 s), ferme la connexion en erreur, et après 5 coupures immédiates d'affilée renonce au flux pour s'en tenir au rafraîchissement toutes les 20 s (D19) ; une connexion tenue plus de 10 s remet le compte à zéro. Au pire, 4 ouvertures par minute et par page au lieu de 12.
- **Limite connue** : une panne où le navigateur ne joint pas le serveur du tout (réseau, certificat) n'arrive jamais au journal, par nature ; le client l'affiche seulement (« Serveur injoignable »).
- **Hors périmètre** : centralisation (Loki, Grafana, alertes par e-mail ou message), traces distribuées, métriques. À ajouter quand il y aura de vrais utilisateurs.
