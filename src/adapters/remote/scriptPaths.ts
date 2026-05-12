import { RemoteScriptName } from "./types";

export const SCRIPT_PATHS: Record<RemoteScriptName, string> = {
  backup: "/opt/mcops/scripts/backup.sh",
  players: "/opt/mcops/scripts/players.sh",
  stop: "/opt/mcops/scripts/poweroff-after-safe-stop.sh",
};

export const SCRIPT_ARGS: Record<RemoteScriptName, string[]> = {
  backup: [],
  players: [],
  stop: [],
};

export const formatRemoteCommand = (script: RemoteScriptName): string =>
  [SCRIPT_PATHS[script], ...SCRIPT_ARGS[script]].join(" ");
