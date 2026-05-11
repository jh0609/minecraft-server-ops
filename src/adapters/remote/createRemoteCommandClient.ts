import { createLocalCommandClientFromEnv } from "./LocalCommandClient";
import { createSshRemoteCommandClientFromEnv } from "./SshRemoteCommandClient";
import { RemoteCommandClient } from "./types";

type RemoteCommandMode = "local" | "ssh";

export const getRemoteCommandMode = (): RemoteCommandMode => {
  const mode = process.env.REMOTE_COMMAND_MODE ?? "ssh";
  if (mode === "local" || mode === "ssh") return mode;
  throw new Error("REMOTE_COMMAND_MODE must be either local or ssh");
};

export const createRemoteCommandClientFromEnv = (): RemoteCommandClient => {
  const mode = getRemoteCommandMode();

  if (mode === "local") {
    return createLocalCommandClientFromEnv();
  }

  return createSshRemoteCommandClientFromEnv();
};
