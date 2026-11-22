# Registre des risques de sécurité

Suivi des failles possibles d'i-am-in, classées selon l'[OWASP Top 10 (2021)](https://owasp.org/Top10/). Ce registre est vivant : chaque PR qui touche à la sécurité le met à jour, et la PR n°15 le reprend pour l'audit final.

**Statuts** : `traité` (contre-mesure en place et testée), `partiel` (en place mais incomplète), `prévu` (rattaché à une PR de la feuille de route), `accepté` (risque résiduel assumé, avec justification).

**Gravité** : probabilité × impact, de 1 (faible) à 3 (élevé) : `faible` ≤ 2, `moyenne` 3-4, `élevée` ≥ 6.

## Contexte de menace

Service **multi-utilisateurs** exposé sur Internet : des comptes d'admins, des joueurs anonymes qui s'inscrivent via un lien public. Actifs, du plus sensible au moins sensible :

1. Les mots de passe des admins (empreintes argon2id) et les sessions.
2. L'intégrité des tournois : un résultat ou un tirage falsifié détruit la confiance des joueurs.
3. Les pseudos Plato des admins et des joueurs (données personnelles ; aucun e-mail n'est collecté).
4. La disponibilité de la page publique pendant un tournoi.

Menaces principales : un admin d'un autre groupe, un joueur anonyme malveillant, un ancien détenteur du relais, un robot qui inscrit en masse.

## Registre

| #   | Catégorie OWASP            | Risque                                                                            | Contre-mesure                                                                                                                | Gravité | Statut  | PR       |
| --- | -------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | -------- |
| R1  | A01 Contrôle d'accès       | Un admin d'un groupe lit ou modifie les tournois d'un autre groupe                | Filtre par groupe dans chaque service, garde d'appartenance (404 identique si le groupe existe ou non), tests d'accès croisé | élevée  | partiel | 7-10     |
| R2  | A01 Contrôle d'accès       | Un ancien détenteur du relais continue d'écrire                                   | Vérification du détenteur dans une transaction verrouillée, `version` sur les matchs                                         | élevée  | traité  | 10       |
| R3  | A01 Contrôle d'accès       | Un admin se donne le rôle de super admin ou invite hors de son périmètre          | Rôle par groupe vérifié côté serveur, un super admin n'invite que des admins, invitations à usage unique                     | élevée  | traité  | 7        |
| R4  | A02 Défaillances crypto    | Mots de passe volés si la base fuit                                               | argon2id (paramètres OWASP), jamais de mot de passe en clair ni dans les logs                                                | moyenne | traité  | 6        |
| R5  | A07 Authentification       | Bourrage d'identifiants, énumération des comptes                                  | Limitation de débit, même message et même durée de réponse en cas d'échec                                                    | élevée  | traité  | 6        |
| R6  | A07 Authentification       | Vol ou fixation de session                                                        | Jeton neuf à chaque connexion, empreinte stockée, cookie `httpOnly` `Secure` `__Host-`                                       | moyenne | traité  | 6        |
| R7  | A01 / A05                  | CSRF sur les routes qui modifient des données                                     | Jeton anti-CSRF par session, en-tête `Origin` vérifié, `SameSite`                                                            | moyenne | traité  | 6        |
| R8  | A04 Conception             | Inscription en masse sur le lien public (robots)                                  | Limitation de débit, pseudo unique par tournoi, validation manuelle par l'admin                                              | moyenne | traité  | 8        |
| R9  | A04 Conception             | Usurpation d'un pseudo Plato                                                      | Validation manuelle de chaque inscription par l'admin                                                                        | moyenne | accepté | 8        |
| R10 | A03 Injection              | Injection SQL, XSS via les pseudos affichés ou copiés dans le chat                | Requêtes paramétrées (Prisma), validation zod, échappement côté interface                                                    | moyenne | partiel | 5        |
| R11 | A04 Conception             | Tirage contesté ou truqué                                                         | Graine aléatoire enregistrée et publiée, journal d'événements                                                                | moyenne | traité  | 2, 9, 10 |
| R12 | A05 Mauvaise configuration | En-têtes de sécurité absents, CORS trop large                                     | `helmet`, CORS strict sur l'origine de l'interface, configuration validée au démarrage                                       | moyenne | traité  | 5        |
| R13 | A06 Composants vulnérables | Dépendance avec une faille connue                                                 | `pnpm audit` en CI (hebdomadaire aussi), Dependabot, actions GitHub figées par empreinte                                     | moyenne | partiel | 1        |
| R14 | A09 Journalisation         | Impossible de retracer une modification de score                                  | Journal d'événements (acteur, type, charge, date) sans donnée sensible                                                       | moyenne | traité  | 10       |
| R15 | A02 / RGPD                 | Fuite de données personnelles par une sauvegarde ou un journal                    | Sauvegardes hors dépôt (`backups/` ignoré), minimisation, durées de conservation du registre RGPD                            | moyenne | prévu   | 14       |
| R16 | A05 Mauvaise configuration | Secret commité par erreur                                                         | `.env` ignoré, `.env.example` sans secret, recherche de secrets (gitleaks) en CI                                             | élevée  | traité  | 1        |
| R17 | A07 Authentification       | Un tiers bloque un compte en multipliant les échecs de connexion                  | Verrouillage de 15 minutes seulement, limite par compte en plus de la limite par IP                                          | faible  | accepté | 6        |
| R18 | A04 Conception             | Réinitialisation obtenue en usurpant l'identité d'un admin auprès du propriétaire | Vérification via Plato par le propriétaire, jeton d'une heure à usage unique, un seul ticket ouvert par compte               | moyenne | accepté | 6        |
| R19 | A05 Mauvaise configuration | Fuite d'un lien d'invitation ou de réinitialisation par l'en-tête Referer         | `helmet` envoie `Referrer-Policy: no-referrer` ; jetons à usage unique et de courte durée                                    | faible  | traité  | 6        |
