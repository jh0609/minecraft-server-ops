import { RemoteScriptName } from "./types";

export const SCRIPT_PATHS: Record<RemoteScriptName, string> = {
  backup: "/opt/mcops/scripts/backup.sh",
  players: "/opt/mcops/scripts/players.sh",
  start: "/usr/bin/systemctl",
  stop: "/opt/mcops/scripts/safe-stop.sh",
};

export const SCRIPT_ARGS: Record<RemoteScriptName, string[]> = {
  backup: [],
  players: [],
  start: ["start", "minecraft"],
  stop: [],
};

export const formatRemoteCommand = (script: RemoteScriptName): string =>
  [SCRIPT_PATHS[script], ...SCRIPT_ARGS[script]].join(" ");
