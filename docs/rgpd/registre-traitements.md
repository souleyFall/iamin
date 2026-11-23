# Registre des traitements (RGPD)

Le RGPD s'applique à toute donnée relative à une personne identifiable, même dans un projet personnel. Ce registre suit le modèle de l'article 30 : il décrit ce qu'i-am-in fait des données, pourquoi, combien de temps, et avec qui elles sont partagées.

**Responsable du traitement** : Souleymane Fall, à titre personnel.

**Contact** : via les « Security advisories » privées du dépôt GitHub (voir `SECURITY.md`). Aucune adresse personnelle n'est publiée.

> Ce document est une analyse de bonne foi, pas un avis juridique. Les durées ci-dessous sont des propositions à confirmer avant la mise en ligne.

## Traitement 1 : comptes des admins

|                      |                                                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité             | Authentifier les admins et super admins de groupe, attribuer les rôles                                                                                                                                                                                    |
| Base légale          | Intérêt légitime (fournir le service demandé par l'admin)                                                                                                                                                                                                 |
| Données              | Identifiant, pseudo Plato, empreinte argon2id du mot de passe, rôle, groupes et rôle dans chacun ; si la double authentification est active : secret TOTP chiffré (AES-256-GCM) et empreintes des codes de secours                                        |
| Personnes concernées | Admins invités                                                                                                                                                                                                                                            |
| Destinataires        | Le propriétaire de la plateforme ; aucun tiers                                                                                                                                                                                                            |
| Conservation         | Tant que le compte existe ; suppression sur demande ; sessions expirées purgées (7 j) ; journal de sécurité du compte (connexions, échecs, mot de passe changé, lien de réinitialisation émis…) purgé au bout de 30 jours, lisible par son titulaire seul |
| Minimisation         | Aucun e-mail ; aucune adresse IP ni agent utilisateur brut : seulement un appareil lisible (« Chrome · Windows ») avec chaque session et chaque événement du journal de sécurité                                                                          |
| Mesures de sécurité  | argon2id, double authentification (obligatoire pour le propriétaire), sessions révocables, accès filtré par groupe (voir registre des risques)                                                                                                            |

## Traitement 2 : inscriptions des joueurs

|                      |                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Finalité             | Gérer l'inscription, le pointage, la liste d'attente et les résultats d'un tournoi                                                                                                                                                                                                   |
| Base légale          | Intérêt légitime ; le joueur s'inscrit de lui-même via le lien                                                                                                                                                                                                                       |
| Données              | Pseudo Plato, statut d'inscription, présence, résultats des matchs, date d'inscription                                                                                                                                                                                               |
| Personnes concernées | Joueurs (sans compte)                                                                                                                                                                                                                                                                |
| Destinataires        | Les admins du groupe ; le pseudo et les résultats sont visibles sur la page publique, mais seulement une fois l'inscription validée                                                                                                                                                  |
| Conservation         | Proposition : 12 mois après la fin du tournoi, puis suppression ou anonymisation                                                                                                                                                                                                     |
| Minimisation         | Aucun e-mail, aucun nom réel, aucune adresse IP stockée dans la base                                                                                                                                                                                                                 |
| Droits               | Le joueur annule via son lien personnel ; effacement sur demande à l'admin du groupe                                                                                                                                                                                                 |
| Suppression          | Annuler ou retirer un joueur supprime sa ligne (aucune trace conservée)                                                                                                                                                                                                              |
| Lien personnel       | Seule l'empreinte SHA-256 du jeton est stockée ; le jeton voyage en en-tête, pas en URL                                                                                                                                                                                              |
| Sur l'appareil       | La page publique garde le lien personnel dans le `localStorage` du joueur (une clé par tournoi), pour retrouver son statut ; jamais envoyé ailleurs qu'à l'API. Effacé à l'annulation ou quand l'inscription n'existe plus. Le service worker ne met aucune donnée de l'API en cache |

## Traitement 3 : tickets de réinitialisation de mot de passe

|              |                                                                             |
| ------------ | --------------------------------------------------------------------------- |
| Finalité     | Rendre l'accès à un admin après vérification d'identité par le propriétaire |
| Données      | Identifiant, pseudo Plato, date de la demande, état du ticket               |
| Conservation | 30 jours après clôture du ticket                                            |

## Traitement 4 : journal des événements d'un tournoi

|              |                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Finalité     | Retracer qui a modifié un tirage, un score ou le relais (contestation, bonne foi)                                                  |
| Données      | Compte admin auteur, type d'action, date, identifiants et scores : aucun pseudo                                                    |
| Conservation | Avec le tournoi ; l'auteur devient « inconnu » si son compte est supprimé                                                          |
| Minimisation | Les actions d'un joueur sans compte n'ont pas d'auteur et ne contiennent que son identifiant d'inscription, supprimé avec sa ligne |

## Traitement 5 : sauvegardes de la base

|              |                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité     | Reprendre le service après une panne ou une erreur                                                                                                                                                |
| Données      | Tout le contenu de la base (comptes admins, pseudos, tournois, journal)                                                                                                                           |
| Conservation | 30 jours (`BACKUP_KEEP_DAYS`), puis suppression automatique par `deploy/backup.sh`                                                                                                                |
| Protection   | Dossier `backups/` ignoré par Git, lisible par son propriétaire seul (`umask 077`) ; la copie hors du serveur doit être chiffrée                                                                  |
| Droits       | Un joueur effacé de la base reste dans les sauvegardes jusqu'à leur suppression, soit 30 jours au plus ; une restauration ne remet jamais une personne effacée en ligne sans nouvelle suppression |

## Traitement 6 : retours des utilisateurs

|              |                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Finalité     | Recueillir les propositions, améliorations et signalements de bugs pour faire évoluer l'outil                                                                                                                                        |
| Données      | Type, message libre (2 000 caractères au plus), date, état ; pour un admin son compte (auteur) ; pour un joueur sans compte, son pseudo Plato seulement s'il choisit de le laisser. Aucune adresse IP ni e-mail                      |
| Base légale  | Intérêt légitime (améliorer le service) ; le pseudo facultatif relève du consentement de la personne qui le saisit                                                                                                                   |
| Accès        | Le propriétaire de la plateforme seulement : ni les super admins ni les admins ne lisent les retours des autres                                                                                                                      |
| Conservation | Retours traités : supprimés au bout d'un an (bouton « Purger » du propriétaire, à utiliser au moins une fois par an) ; les autres restent tant qu'ils ne sont pas traités. Le propriétaire peut supprimer un retour à tout moment    |
| Minimisation | Les joueurs écrivent sans compte et anonymement ; le message libre peut contenir des données personnelles que la personne y met : l'écran le rappelle, et la suppression à la demande est possible (le propriétaire efface la ligne) |
| Droits       | Un joueur anonyme ne peut pas être retrouvé s'il n'a pas laissé de pseudo ; s'il en a laissé un, il demande la suppression au propriétaire. À la suppression d'un compte admin, ses retours restent mais n'ont plus d'auteur         |

## Traitement 7 : journal technique de l'API

|              |                                                                                                                                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité     | Comprendre et corriger les pannes, bugs et abus (erreurs, refus, événements de sécurité) ; retrouver ce qui s'est passé à partir de la référence affichée à l'écran                                                                                                  |
| Données      | Pour chaque requête : heure, méthode, route (le modèle `/groups/:groupId`, jamais l'adresse réelle), statut, durée, identifiant de requête, rôle, identifiant du compte connecté (pseudonyme : un uuid, jamais le nom). Pour une erreur : nom, code, trace technique |
| Exclu        | Adresse IP, agent utilisateur, en-têtes, cookies, mots de passe, jetons, corps des requêtes, valeurs des requêtes à la base, paramètres d'adresse, pseudos Plato (champs dont le nom évoque un secret masqués d'office)                                              |
| Base légale  | Intérêt légitime (sécurité et fiabilité du service)                                                                                                                                                                                                                  |
| Accès        | L'administrateur du serveur seulement (`docker compose logs`) ; aucun écran ne les affiche                                                                                                                                                                           |
| Conservation | Rotation par taille : 5 fichiers de 20 Mo par conteneur, soit de quelques jours à quelques semaines selon le trafic ; rien n'est exporté vers un tiers                                                                                                               |
| Droits       | L'identifiant de compte est un uuid : sans la base il ne désigne personne. À la suppression d'un compte, ses anciennes lignes ne sont plus rattachables à une personne et s'effacent avec la rotation                                                                |

## Hors dépôt

- **Journaux d'accès du serveur web** : désactivés. Caddy n'écrit que ses erreurs (`deploy/Caddyfile`), donc aucune adresse IP n'est conservée. L'API ne voit l'adresse qu'en mémoire, pour limiter le débit (D21).
- **Journaux des conteneurs** : rotation par taille (5 fichiers de 20 Mo). Celui de l'API est le journal technique du traitement 7 ; celui de Caddy ne contient que ses erreurs.
