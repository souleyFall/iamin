# Décisions techniques

Chaque décision est numérotée. Une décision remplacée n'est pas supprimée : on l'annote.

## D1. Monorepo pnpm

Un seul dépôt, des sous-projets dans `apps/` (API, interface) et `packages/` (code partagé). Les schémas de validation et les types sont partagés entre l'API et l'interface ; le moteur de tournoi (D6) est utilisé par les deux.

## D2. React + Vite (PWA), NestJS, Prisma, PostgreSQL

- **Interface** : React avec Vite, sans rendu serveur : une PWA n'en a pas besoin. TanStack Query pour les données, `vite-plugin-pwa` pour l'installation.
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

Trois rôles : **propriétaire** de la plateforme (invite les créateurs de groupe, traite les tickets), **super admin de groupe** (invite ses admins, reprend le relais), **admin**. L'inscription d'un compte se fait sur invitation. Le mot de passe oublié passe par un ticket que reçoit le propriétaire, qui vérifie l'identité via Plato avant de transmettre un lien de réinitialisation à usage unique et de courte durée.

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
- **Invitations** : lien à usage unique de 7 jours, jeton stocké haché. Le propriétaire invite des créateurs de groupe ; ceux-ci inviteront leurs admins avec les groupes (PR 7).
- **Limites de débit** : par adresse IP sur les routes sensibles, et par compte (10 échecs en 15 minutes) pour les attaques réparties. Compromis assumé : on peut bloquer un compte 15 minutes en s'y trompant exprès. État en mémoire, donc une seule instance d'API (à revoir sinon).
- **Premier compte** : le propriétaire se crée en ligne de commande (`create-owner`), mot de passe par variable d'environnement, jamais par argument.

## D14. Groupes : le rôle est porté par l'appartenance

- **Deux niveaux de rôle** : sur la plateforme (`PLATFORM_OWNER` ou `MEMBER`) et dans chaque groupe (`SUPER_ADMIN` ou `ADMIN`, table `GroupMember`). Un compte peut être super admin d'un groupe et simple admin d'un autre. Cela remplace les rôles globaux de D13 (migration cassante, sans conséquence avant la mise en ligne).
- **Seule porte d'entrée vers les données d'un groupe : `GroupGuard`.** Le groupe est lu dans le chemin (`/groups/:groupId/…`), jamais dans le corps de la requête, et l'appartenance est vérifiée à chaque appel : retirer un membre lui ferme l'accès immédiatement, sans attendre la fin de sa session.
- **404 uniforme** : un compte qui n'est pas membre reçoit exactement la même réponse que pour un groupe inexistant ou un identifiant mal formé. Impossible de deviner quels groupes existent. Un membre dont le rôle ne suffit pas reçoit 403.
- **Le propriétaire de la plateforme** crée les groupes, voit la liste de tous et peut réinviter un super admin (assistance), mais ne lit pas les données internes des groupes : `allowOwner` est un choix explicite par route.
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
