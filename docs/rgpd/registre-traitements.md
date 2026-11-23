# Registre des traitements (RGPD)

Le RGPD s'applique à toute donnée relative à une personne identifiable, même dans un projet personnel. Ce registre suit le modèle de l'article 30 : il décrit ce qu'i-am-in fait des données, pourquoi, combien de temps, et avec qui elles sont partagées.

**Responsable du traitement** : Souleymane Fall, à titre personnel.

**Contact** : via les « Security advisories » privées du dépôt GitHub (voir `SECURITY.md`). Aucune adresse personnelle n'est publiée.

> Ce document est une analyse de bonne foi, pas un avis juridique. Les durées ci-dessous sont des propositions à confirmer avant la mise en ligne.

## Traitement 1 : comptes des admins

|                      |                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Finalité             | Authentifier les admins et super admins de groupe, attribuer les rôles                           |
| Base légale          | Intérêt légitime (fournir le service demandé par l'admin)                                        |
| Données              | Identifiant, pseudo Plato, empreinte argon2id du mot de passe, rôle, groupes et rôle dans chacun |
| Personnes concernées | Admins invités                                                                                   |
| Destinataires        | Le propriétaire de la plateforme ; aucun tiers                                                   |
| Conservation         | Tant que le compte existe ; suppression sur demande ; sessions expirées purgées (7 j)            |
| Minimisation         | Aucun e-mail, aucune adresse IP ni agent utilisateur stockés avec les sessions                   |
| Mesures de sécurité  | argon2id, sessions révocables, accès filtré par groupe (voir registre des risques)               |

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

## Hors dépôt

Les journaux d'accès du serveur web peuvent contenir des adresses IP : durée de conservation à fixer lors du déploiement (PR n°14).
