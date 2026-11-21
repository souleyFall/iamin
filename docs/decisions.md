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
