#!/usr/bin/env bash
set -euo pipefail

MCOPS_ENV="${MCOPS_ENV:-/opt/mcops/mcops.env}"
MCRCON_BIN="${MCRCON_BIN:-mcrcon}"

fail() {
  printf 'players.sh: %s\n' "$1" >&2
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

if ! command -v "$MCRCON_BIN" >/dev/null 2>&1; then
  fail "mcrcon command not found" 20
fi

if ! output="$("$MCRCON_BIN" \
  -H "$MINECRAFT_RCON_HOST" \
  -P "$MINECRAFT_RCON_PORT" \
  -p "$MINECRAFT_RCON_PASSWORD" \
  "list" 2>&1)"; then
  fail "RCON list failed" 20
fi

player_count="$(printf '%s\n' "$output" | sed -n 's/^There are \([0-9][0-9]*\) of .*$/\1/p' | head -n 1)"

if [[ -z "$player_count" ]]; then
  fail "could not parse player count" 21
fi

printf '%s\n' "$player_count"

