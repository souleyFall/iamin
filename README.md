# i-am-in

PWA de gestion de tournois pour les groupes Plato. Un admin crée un tournoi en deux minutes, partage un lien d'inscription (pseudo Plato uniquement), tire les adversaires au sort, saisit les scores, et tout le monde suit le classement en direct au lieu d'une capture d'écran. Il gère aussi les absents, la liste d'attente et les nombres impairs, et génère le texte à coller dans le chat.

> i-am-in est un outil indépendant, non affilié à Plato. Il n'utilise ni son nom de marque, ni son logo.

**État** : version 0.1.0 prête à être déployée : les 15 pull requests de la [feuille de route](docs/roadmap.md) sont fusionnées. Reste à choisir un hébergeur et un nom de domaine (voir « Mettre en production »).

## Pile technique

React (Vite, PWA), NestJS, PostgreSQL (Prisma), monorepo pnpm. Détail et raisons : [docs/decisions.md](docs/decisions.md).

## Développer

Prérequis : Node 24, pnpm, Docker Desktop.

```bash
pnpm install      # installe les hooks Git (.githooks) et génère le client Prisma
pnpm check        # lint, formatage, types, tests, build
```

Lancer l'API en local :

```bash
cp .env.example .env              # puis remplis POSTGRES_PASSWORD et le mot de passe de DATABASE_URL
docker compose up -d --wait       # PostgreSQL, accessible depuis cette machine uniquement
pnpm --filter @iamin/api build
pnpm --filter @iamin/api exec prisma migrate deploy   # crée les tables
pnpm --filter @iamin/api start    # puis http://localhost:3000/health
```

Lancer l'interface admin (l'API doit tourner ; si le port 3000 est pris, lance l'API avec `PORT` et indique-le à l'interface) :

```bash
cp apps/web/.env.example apps/web/.env   # facultatif : VITE_API_URL (défaut http://localhost:3000)
pnpm --filter @iamin/web dev             # puis http://localhost:5173 (WEB_ORIGIN de l'API doit être cette adresse exacte)
```

La page des joueurs est `/t/<lien du tournoi>` (le lien se copie depuis l'onglet Inscrits) : inscription, statut et direct, sans compte. L'application est installable (PWA) : le service worker n'est actif que dans la version construite, pour l'essayer en local :

```bash
pnpm --filter @iamin/web build
pnpm --filter @iamin/web preview   # http://localhost:4173 (WEB_ORIGIN de l'API doit être cette adresse)
```

Créer le compte du propriétaire (le premier compte : personne ne peut l'inviter). Le mot de passe passe par une variable d'environnement, jamais par un argument, pour ne rester ni dans la liste des processus ni dans l'historique du terminal :

```powershell
$env:IAMIN_OWNER_PASSWORD = 'un mot de passe de 12 caractères ou plus'
node apps/api/dist/scripts/create-owner.js mon-identifiant MonPseudoPlato
Remove-Item env:IAMIN_OWNER_PASSWORD
```

Mot de passe perdu : même commande avec le même identifiant et `--reset-password`.

**Double authentification** (obligatoire pour le propriétaire, [D24](docs/decisions.md)) : à sa première connexion, le propriétaire est dirigé vers l'écran Sécurité, scanne un QR code avec une application d'authentification (Microsoft Authenticator, Aegis, 2FAS…), donne un premier code et garde ses 10 codes de secours. Il donne ensuite son code à chaque connexion, et avant ses actions sensibles (inviter un super admin, émettre un lien de réinitialisation, supprimer, purger). Téléphone et codes de secours perdus : sur le serveur, `node dist/scripts/create-owner.js <identifiant> --reset-2fa` (ses sessions sont fermées, il réactive à la connexion suivante). En production, `TOTP_ENCRYPTION_KEY` (`openssl rand -hex 32`) chiffre les secrets : garde-en une copie hors du serveur.

Qui fait quoi ([D22](docs/decisions.md)) : le propriétaire se connecte, ouvre l'onglet **Moi** puis **Inviter un super admin**, et transmet le lien. Le super admin crée son compte avec ce lien, puis **crée lui-même ses groupes** (5 au plus) et y invite ses admins depuis l'onglet **Groupe**. Le propriétaire ne crée pas de groupe et ne lit pas leurs données. Les retours des utilisateurs (page /avis, lien en bas de la page des joueurs) arrivent dans **Moi** puis **Retours des utilisateurs** ([D23](docs/decisions.md)).

Tests d'intégration (vraie base) : ils tournent en CI. En local, ils sont ignorés tant que `TEST_DATABASE_URL` n'est pas défini, et refusent de tourner sur une base dont le nom ne finit pas par `_test` (ils vident les tables).

```bash
docker compose exec db psql -U iamin -d postgres -c "CREATE DATABASE iamin_test"
# TEST_DATABASE_URL = DATABASE_URL avec le nom de base iamin_test
pnpm --filter @iamin/api exec prisma migrate deploy   # avec DATABASE_URL pointant sur iamin_test
pnpm test
```

## Mettre en production

Il faut un serveur Linux avec Docker, un nom de domaine qui pointe vers lui (enregistrement DNS) et les ports 80 et 443 ouverts. Voir [D21](docs/decisions.md).

```bash
cp .env.prod.example .env.prod && chmod 600 .env.prod    # remplis SITE_ADDRESS et POSTGRES_PASSWORD (openssl rand -hex 24)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Les migrations s'appliquent toutes seules avant l'API ; Caddy obtient le certificat HTTPS. Créer le compte du propriétaire :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -e IAMIN_OWNER_PASSWORD='...' api node dist/scripts/create-owner.js mon-identifiant MonPseudoPlato
```

Sauvegarder (tous les jours en cron) et restaurer. La copie hors du serveur, chiffrée, est à ta charge :

```bash
bash deploy/backup.sh
bash deploy/restore.sh backups/iamin-AAAAMMJJTHHMMSSZ.dump
```

Mettre à jour : `git pull` puis la commande `up -d --build` ci-dessus (quelques secondes d'interruption).

### Lire les logs

L'API écrit une ligne JSON par événement (requêtes, erreurs, sécurité, démarrage) ; Docker la garde 5 × 20 Mo. Chaque erreur du serveur affiche à l'écran une référence « (réf. 1a2b3c4d) » : c'est la clé pour retrouver sa ligne. `scripts/logs.mjs` filtre le flux (voir [D28](docs/decisions.md)) :

```bash
LOGS="docker compose -f docker-compose.prod.yml --env-file .env.prod logs api --no-log-prefix"
$LOGS --since 1h | node scripts/logs.mjs --summary                    # bilan : erreurs fréquentes, routes lentes
$LOGS --since 24h | node scripts/logs.mjs --level error               # toutes les erreurs
$LOGS | node scripts/logs.mjs --req 1a2b3c4d-...                       # tout ce qui s'est passé pour une requête
$LOGS --since 6h | node scripts/logs.mjs --event security. --level warn   # échecs de connexion, verrouillages
$LOGS | node scripts/logs.mjs --status 5xx --route /groups --since 1d
```

`LOG_LEVEL=debug` dans `.env.prod` (puis `up -d`) pour creuser, `warn` pour ne garder que les problèmes.

## Pour aller plus loin

- Décisions : [docs/decisions.md](docs/decisions.md)
- Feuille de route : [docs/roadmap.md](docs/roadmap.md)
- Journal : [docs/journal.md](docs/journal.md)
- Sécurité : [SECURITY.md](SECURITY.md) et [registre des risques](docs/securite/registre-risques.md)
- RGPD : [registre des traitements](docs/rgpd/registre-traitements.md)

## Licence

MIT : voir [LICENSE](LICENSE).
