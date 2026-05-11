import { RemoteScriptName } from "./types";

export const SCRIPT_PATHS: Record<RemoteScriptName, string> = {
  backup: "/opt/mcops/scripts/backup.sh",
  players: "/opt/mcops/scripts/players.sh",
  stop: "/opt/mcops/scripts/safe-stop.sh",
};
