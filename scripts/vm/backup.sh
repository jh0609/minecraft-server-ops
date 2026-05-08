#!/usr/bin/env bash
set -euo pipefail

MCOPS_ENV="${MCOPS_ENV:-/opt/mcops/mcops.env}"

fail() {
  printf 'backup.sh: %s\n' "$1" >&2
  exit "${2:-1}"
}

if [[ ! -r "$MCOPS_ENV" ]]; then
  fail "config not readable: $MCOPS_ENV" 70
fi

# shellcheck source=/dev/null
source "$MCOPS_ENV"

: "${MINECRAFT_WORLD_DIR:?MINECRAFT_WORLD_DIR is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${BACKUP_RETENTION_COUNT:?BACKUP_RETENTION_COUNT is required}"

if [[ ! "$BACKUP_RETENTION_COUNT" =~ ^[0-9]+$ ]] || (( BACKUP_RETENTION_COUNT < 1 )); then
  fail "BACKUP_RETENTION_COUNT must be a positive integer" 70
fi

if [[ ! -d "$MINECRAFT_WORLD_DIR" ]]; then
  fail "world directory not found: $MINECRAFT_WORLD_DIR" 40
fi

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u '+%Y%m%d-%H%M%S')"
backup_path="$BACKUP_DIR/world-$timestamp.tar.gz"
tmp_path="$backup_path.tmp"
world_parent="$(dirname "$MINECRAFT_WORLD_DIR")"
world_name="$(basename "$MINECRAFT_WORLD_DIR")"

cleanup() {
  if [[ -n "${tmp_path:-}" && -f "$tmp_path" ]]; then
    rm -f -- "$tmp_path"
  fi
}
trap cleanup EXIT

tar -C "$world_parent" -czf "$tmp_path" "$world_name"
mv -- "$tmp_path" "$backup_path"

mapfile -t backups_to_remove < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'world-*.tar.gz' -printf '%T@ %p\n' |
    sort -rn |
    awk -v keep="$BACKUP_RETENTION_COUNT" 'NR > keep { $1=""; sub(/^ /, ""); print }'
)

for old_backup in "${backups_to_remove[@]}"; do
  if [[ -n "$old_backup" && "$old_backup" == "$BACKUP_DIR"/world-*.tar.gz ]]; then
    rm -f -- "$old_backup"
  fi
done

printf '%s\n' "$backup_path"

