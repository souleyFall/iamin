#!/usr/bin/env bash
# Restaure une sauvegarde faite par backup.sh. ATTENTION : remplace tout le contenu actuel de la base.
#
#   bash deploy/restore.sh backups/iamin-20261123T030000Z.dump
#
# Arrête l'API pendant la restauration, puis la relance. Teste ce script sur une copie du serveur
# avant d'en avoir besoin : une sauvegarde jamais restaurée n'est pas une sauvegarde.
set -euo pipefail

if [ $# -ne 1 ] || [ ! -s "$1" ]; then
  echo "Usage : bash deploy/restore.sh backups/iamin-AAAAMMJJTHHMMSSZ.dump" >&2
  exit 2
fi

cd "$(dirname "$0")/.."
compose=(docker compose -f docker-compose.prod.yml --env-file "${ENV_FILE:-.env.prod}")

if [ "${RESTORE_YES:-}" != "oui" ]; then
  read -r -p "Remplacer TOUTE la base par $1 ? Tape « oui » pour continuer : " answer
  [ "$answer" = "oui" ] || { echo "Annulé."; exit 1; }
fi

"${compose[@]}" stop web api
"${compose[@]}" exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' <"$1"
"${compose[@]}" start api web
echo "Restauration terminée."
