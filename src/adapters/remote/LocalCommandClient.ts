import { spawn } from "child_process";
import {
  RemoteCommandClient,
  RemoteCommandRequest,
  RemoteCommandResult,
} from "./types";
import { formatRemoteCommand, SCRIPT_ARGS, SCRIPT_PATHS } from "./scriptPaths";

type LocalCommandClientOptions = {
  commandTimeoutMs: number;
};

const optionalIntegerEnv = (name: string, defaultValue: number): number => {
  const value = process.env[name];
  if (!value) return defaultValue;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
};

export const createLocalCommandClientFromEnv = (): LocalCommandClient =>
  new LocalCommandClient({
    commandTimeoutMs:
      optionalIntegerEnv("REMOTE_COMMAND_TIMEOUT_SECONDS", 300) * 1000,
  });

export class LocalCommandClient implements RemoteCommandClient {
  constructor(private readonly options: LocalCommandClientOptions) {}

  async run(request: RemoteCommandRequest): Promise<RemoteCommandResult> {
    const command = SCRIPT_PATHS[request.script];
    if (!command) {
      throw new Error(`Unsupported remote script: ${request.script}`);
    }
    const args = SCRIPT_ARGS[request.script];
    const formattedCommand = formatRemoteCommand(request.script);

    const timeoutMs = request.timeoutMs ?? this.options.commandTimeoutMs;
    const startedAt = Date.now();

    return new Promise<RemoteCommandResult>((resolve) => {
      let settled = false;
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let forceKillTimer: NodeJS.Timeout | undefined;

      const child = spawn(command, args, {
        shell: false,
        windowsHide: true,
      });

      const finish = (
        result: Omit<RemoteCommandResult, "durationMs">
      ): void => {
        if (settled) return;
        settled = true;
        clearTimeout(commandTimer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        resolve({
          ...result,
          durationMs: Date.now() - startedAt,
        });
      };

      const commandTimer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
      }, timeoutMs);

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString("utf8");
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString("utf8");
      });

      child.on("error", (error) => {
        stderr += error.message;
        finish({
          script: request.script,
          command: formattedCommand,
          exitCode: null,
          signal: null,
          stdout,
          stderr,
          timedOut,
        });
      });

      child.on("close", (exitCode, signal) => {
        finish({
          script: request.script,
          command: formattedCommand,
          exitCode,
          signal,
          stdout,
          stderr,
          timedOut,
        });
      });
    });
  }
}
