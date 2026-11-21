# i-am-in

PWA de gestion de tournois pour les groupes Plato. Un admin crée un tournoi en deux minutes, partage un lien d'inscription (pseudo Plato uniquement), tire les adversaires au sort, saisit les scores, et tout le monde suit le classement en direct au lieu d'une capture d'écran. Il gère aussi les absents, la liste d'attente et les nombres impairs, et génère le texte à coller dans le chat.

> i-am-in est un outil indépendant, non affilié à Plato. Il n'utilise ni son nom de marque, ni son logo.

**État** : version 0.1.0 en préparation (voir [la feuille de route](docs/roadmap.md)).

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
pnpm --filter @iamin/api start    # puis http://localhost:3000/health
```

## Pour aller plus loin

- Décisions : [docs/decisions.md](docs/decisions.md)
- Feuille de route : [docs/roadmap.md](docs/roadmap.md)
- Journal : [docs/journal.md](docs/journal.md)
- Sécurité : [SECURITY.md](SECURITY.md) et [registre des risques](docs/securite/registre-risques.md)
- RGPD : [registre des traitements](docs/rgpd/registre-traitements.md)

## Licence

MIT : voir [LICENSE](LICENSE).
