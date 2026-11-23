#!/usr/bin/env bash
# Sauvegarde de la base de production : un fichier `pg_dump` (format personnalisé, compressé)
# dans backups/, puis suppression des sauvegardes plus vieilles que BACKUP_KEEP_DAYS (30 par défaut,
# voir le registre RGPD). Les sauvegardes contiennent des données personnelles : le dossier est
# ignoré par Git, lisible par toi seul (umask 077), et ne doit jamais être publié.
#
#   bash deploy/backup.sh
#   0 3 * * * cd /chemin/vers/iamin && bash deploy/backup.sh      # tous les jours à 3 h (cron)
#
# Pense à copier le dossier backups/ HORS du serveur (une sauvegarde sur le même disque ne protège
# pas d'une panne du disque), de préférence chiffrée (gpg ou age).
set -euo pipefail

cd "$(dirname "$0")/.."
compose=(docker compose -f docker-compose.prod.yml --env-file "${ENV_FILE:-.env.prod}")
dir="${BACKUP_DIR:-backups}"
keep_days="${BACKUP_KEEP_DAYS:-30}"

umask 077
mkdir -p "$dir"
file="$dir/iamin-$(date -u +%Y%m%dT%H%M%SZ).dump"

# Écrit dans un fichier temporaire : une sauvegarde interrompue ne remplace jamais une bonne.
"${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$file.tmp"
if [ ! -s "$file.tmp" ]; then
  rm -f "$file.tmp"
  echo "Sauvegarde vide : abandon." >&2
  exit 1
fi
mv "$file.tmp" "$file"
echo "Sauvegarde écrite : $file ($(du -h "$file" | cut -f1))"

find "$dir" -name 'iamin-*.dump' -type f -mtime "+$keep_days" -print -delete |
  sed 's/^/Supprimée (trop ancienne) : /'
