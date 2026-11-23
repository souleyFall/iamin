# Feuille de route

Une ligne par pull request prévue. L'ordre peut évoluer ; l'état est mis à jour à chaque fusion.

## Version 0.1.0 : élimination directe et ligue

| #   | PR                                                                                 | État      |
| --- | ---------------------------------------------------------------------------------- | --------- |
| 1   | `chore` : fondations (dépôt, qualité, CI, hook pre-push, documents)                | fusionnée |
| 2   | `feat(engine)` : arbre d'élimination directe, byes, tirage vérifiable              | fusionnée |
| 3   | `feat(engine)` : ligue (tournoi à la ronde, classement, départages)                | fusionnée |
| 4   | `feat(engine)` : générateurs de texte pour le chat                                 | fusionnée |
| 5   | `chore(api)` : API NestJS, PostgreSQL, Prisma, Docker Compose                      | fusionnée |
| 6   | `feat(auth)` : sessions, argon2id, CSRF, invitations, tickets de réinitialisation  | fusionnée |
| 7   | `feat(groups)` : groupes, rôles, garde d'appartenance, tests d'accès croisé        | fusionnée |
| 8   | `feat(tournaments)` : création, inscriptions, liste d'attente, pointage            | fusionnée |
| 9   | `feat(matches)` : tirage, scores, forfaits, remplacements                          | fusionnée |
| 10  | `feat(relay)` : relais entre admins, journal d'événements                          | fusionnée |
| 11  | `feat(live)` : page publique et SSE                                                | fusionnée |
| 12  | `feat(web)` : interface admin (jetons de design, écrans de la maquette)            | fusionnée |
| 13  | `feat(web)` : interface publique, PWA installable                                  | fusionnée |
| 14  | `chore(deploy)` : images Docker, Compose de production, HTTPS, sauvegardes         | fusionnée |
| 15  | `docs(security)` : audit final, registre des risques, registre des traitements     | fusionnée |
| 16  | `feat(groups)` : le propriétaire valide les super admins, qui créent leurs groupes | fusionnée |
| 17  | `feat(groups)` : pseudo Plato imposé par l'invitation                              | fusionnée |
| 18  | `feat(feedback)` : retours des utilisateurs (idées, améliorations, bugs)           | fusionnée |
| 19  | `feat(auth)` : double authentification (TOTP) du propriétaire, ressaisie du code   | fusionnée |
| 20  | `feat(auth)` : verrouillage par adresse, sessions actives, journal de sécurité     | fusionnée |
| 21  | `feat(web)` : mise en page ordinateur (barre latérale, deux colonnes, cartes)      | fusionnée |

## Après

- 0.2.0 : tournoi classique (poules puis élimination), notifications.
- 0.3.0 : tournoi au mérite (cumul de points sur plusieurs matchs, sans élimination), partage en image.
- 0.4.0 : comptes joueurs optionnels.
- 0.5.0 : annuaire de groupes (public ou privé, filtres, règles, conditions d'accès).
- 0.6.0 : commentaires, demandes d'adhésion, listing de tournois.
- 1.0.0 : stabilisé avec de vrais groupes.
