# Images d'i-am-in. Un seul fichier, trois cibles utiles :
#   build   : tout le dépôt installé et compilé (étape intermédiaire)
#   api     : l'API seule, dépendances de production uniquement, utilisateur sans droits
#   web     : l'interface construite, servie par Caddy (HTTPS automatique, en-têtes, CSP)
#
# Construire depuis la racine du dépôt :
#   docker build --target api -t iamin-api .
#   docker build --target web -t iamin-web .

# ---- Base : Node et pnpm (version lue dans package.json via corepack) ----
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- build : installation et compilation de tout le dépôt ----
FROM base AS build
# Prisma charge OpenSSL au démarrage.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Les manifestes d'abord : l'installation est refaite seulement quand ils changent.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Les scripts d'installation sont lancés à la main plus bas, dans l'ordre voulu.
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY packages/engine packages/engine
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter @iamin/engine build \
  && pnpm --filter @iamin/api build

# ---- api-prod : dépendances de production seulement, client Prisma généré ----
# `prisma` est une dépendance de production de l'API : il génère le client ici et applique les
# migrations au déploiement (`docker compose run --rm migrate`).
FROM base AS api-prod
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --filter "@iamin/api..."
COPY apps/api/prisma apps/api/prisma
RUN pnpm --filter @iamin/api exec prisma generate
COPY --from=build /app/packages/engine/dist packages/engine/dist
COPY --from=build /app/apps/api/dist apps/api/dist

# ---- api : image d'exécution ----
FROM node:24-slim AS api
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=api-prod --chown=node:node /app /app
# Utilisateur sans droits : une faille dans l'API ne donne pas la main sur le conteneur.
USER node
EXPOSE 3000
# Sonde de santé : répond 200 quand la base répond, 503 sinon (voir /health).
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]

# ---- web-build : l'interface compilée ----
FROM build AS web-build
# L'interface appelle l'API sur la même origine, sous /api (Caddy fait le relais) :
# pas de CORS à ouvrir, un seul nom de domaine, cookie `__Host-` valable.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @iamin/web build

# ---- web : Caddy + fichiers statiques ----
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /app/apps/web/dist /srv
