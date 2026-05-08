#!/usr/bin/env bash
set -euo pipefail

# Exit code policy:
# 0  success
# 10 players online and force was not requested
# 20 RCON unavailable
# 30 save-all failed
# 40 backup failed
# 50 Minecraft stop command failed
# 60 Minecraft process did not stop before timeout
# 70 invalid config
# 80 lock already held

MCOPS_ENV="${MCOPS_ENV:-/opt/mcops/mcops.env}"

fail() {
  printf 'safe-stop.sh: %s\n' "$1" >&2
  exit "${2:-1}"
}

if [[ ! -r "$MCOPS_ENV" ]]; then
  fail "config not readable: $MCOPS_ENV" 70
fi

# shellcheck source=/dev/null
source "$MCOPS_ENV"

: "${MINECRAFT_RCON_HOST:?MINECRAFT_RCON_HOST is required}"
: "${MINECRAFT_RCON_PORT:?MINECRAFT_RCON_PORT is required}"
: "${MINECRAFT_RCON_PASSWORD:?MINECRAFT_RCON_PASSWORD is required}"
: "${MINECRAFT_SERVICE_NAME:?MINECRAFT_SERVICE_NAME is required}"
: "${MINECRAFT_WORLD_DIR:?MINECRAFT_WORLD_DIR is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${BACKUP_RETENTION_COUNT:?BACKUP_RETENTION_COUNT is required}"
: "${STOP_TIMEOUT_SECONDS:?STOP_TIMEOUT_SECONDS is required}"

# TODO: Parse an explicit --force flag.
# TODO: Acquire a lock to prevent concurrent shutdown attempts.
# TODO: Run players.sh and fail with exit code 10 when players are online
#       and force was not requested.
# TODO: Run RCON save-all and fail with exit code 30 on error.
# TODO: Run backup.sh and fail with exit code 40 on error.
# TODO: Run RCON stop and fail with exit code 50 on error.
# TODO: Confirm the Minecraft service/process stops within STOP_TIMEOUT_SECONDS.
# TODO: Return exit code 0 only after all required shutdown steps succeed.

fail "safe-stop skeleton only; stop logic is not implemented yet" 70

