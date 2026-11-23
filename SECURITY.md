# Politique de sécurité

i-am-in est un service en ligne utilisé par de vrais groupes : des comptes d'admins (identifiant et mot de passe) et des pseudos de joueurs y sont stockés. La sécurité y est traitée sérieusement.

## Signaler une vulnérabilité

**N'ouvrez pas de ticket public** pour une faille.

Utilisez le signalement privé de GitHub : onglet **Security** du dépôt, puis **Report a vulnerability**. Indiquez ce que vous avez observé, comment le reproduire et l'impact que vous imaginez. N'incluez aucune donnée personnelle réelle.

Je m'engage à accuser réception sous 7 jours et à corriger ou à répondre sur la suite donnée sous 30 jours.

## Périmètre

Dans le périmètre : le code de ce dépôt, sa configuration Docker, ses workflows GitHub Actions, l'instance publique d'i-am-in.

Hors périmètre : les services tiers (Plato, hébergeur), les attaques supposant déjà l'accès au poste de l'utilisateur, le déni de service par volume, l'ingénierie sociale contre un admin.

## Mesures en place

Contrôle d'accès par groupe vérifié côté serveur, sessions révocables, mots de passe argon2id, double authentification (TOTP) obligatoire pour le propriétaire de la plateforme et ressaisie du code avant ses actions sensibles, sessions actives et journal de sécurité consultables par chaque titulaire, protection CSRF, limites de débit sur toutes les routes publiques, CSP stricte, HTTPS automatique, aucun journal d'accès, sauvegardes de 30 jours. Le détail, les risques acceptés et l'audit de la version 0.1.0 sont dans le [registre des risques](docs/securite/registre-risques.md) ; le traitement des données personnelles, dans le [registre RGPD](docs/rgpd/registre-traitements.md).

## Ce qu'il ne faut jamais publier

Fichiers `.env`, mots de passe, jetons de session, liens de réinitialisation, ou toute donnée personnelle réelle. Si vous en trouvez dans l'historique du dépôt, signalez-le de la même façon.

## En cas de fuite d'un secret (pour le mainteneur)

1. Révoquer le secret chez son émetteur, avant toute autre action.
2. Invalider toutes les sessions (vider la table des sessions) si la base ou le secret de session est concerné.
3. Remplacer le secret, puis redéployer.
4. Retirer le secret de l'historique Git seulement après la révocation (la révocation est ce qui protège).
5. Noter l'incident dans le [journal](docs/journal.md) et mettre à jour le [registre des risques](docs/securite/registre-risques.md).
