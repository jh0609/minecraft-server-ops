import { readFileSync } from "fs";
import { Client, ConnectConfig } from "ssh2";
import {
  RemoteCommandClient,
  RemoteCommandRequest,
  RemoteCommandResult,
} from "./types";
import { formatRemoteCommand, SCRIPT_ARGS, SCRIPT_PATHS } from "./scriptPaths";

type SshRemoteCommandClientOptions = {
  host: string;
  port: number;
  username: string;
  privateKeyPath: string;
  connectTimeoutMs: number;
  commandTimeoutMs: number;
};

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
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

export const createSshRemoteCommandClientFromEnv = (): SshRemoteCommandClient =>
  new SshRemoteCommandClient({
    host: requiredEnv("SSH_HOST"),
    port: optionalIntegerEnv("SSH_PORT", 22),
    username: requiredEnv("SSH_USER"),
    privateKeyPath: requiredEnv("SSH_PRIVATE_KEY_PATH"),
    connectTimeoutMs:
      optionalIntegerEnv("SSH_CONNECT_TIMEOUT_SECONDS", 15) * 1000,
    commandTimeoutMs:
      optionalIntegerEnv("REMOTE_COMMAND_TIMEOUT_SECONDS", 300) * 1000,
  });

export class SshRemoteCommandClient implements RemoteCommandClient {
  constructor(private readonly options: SshRemoteCommandClientOptions) {}

  async run(request: RemoteCommandRequest): Promise<RemoteCommandResult> {
    const command = SCRIPT_PATHS[request.script];
    if (!command) {
      throw new Error(`Unsupported remote script: ${request.script}`);
    }
    const commandLine = this.formatSshCommand(command, SCRIPT_ARGS[request.script]);
    const formattedCommand = formatRemoteCommand(request.script);

    const timeoutMs = request.timeoutMs ?? this.options.commandTimeoutMs;
    const startedAt = Date.now();

    return new Promise<RemoteCommandResult>((resolve, reject) => {
      const connection = new Client();
      let settled = false;
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const finish = (result: Omit<RemoteCommandResult, "durationMs">) => {
        if (settled) return;
        settled = true;
        clearTimeout(commandTimer);
        connection.end();
        resolve({
          ...result,
          durationMs: Date.now() - startedAt,
        });
      };

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(commandTimer);
        connection.end();
        reject(error);
      };

      const commandTimer = setTimeout(() => {
        timedOut = true;
        finish({
          script: request.script,
          command: formattedCommand,
          exitCode: null,
          signal: null,
          stdout,
          stderr,
          timedOut,
        });
      }, timeoutMs);

      connection
        .on("ready", () => {
          connection.exec(commandLine, (execError, stream) => {
            if (execError) {
              fail(execError);
              return;
            }

            stream
              .on("close", (exitCode: number | null, signal: string | null) => {
                finish({
                  script: request.script,
                  command: formattedCommand,
                  exitCode,
                  signal,
                  stdout,
                  stderr,
                  timedOut,
                });
              })
              .on("data", (data: Buffer) => {
                stdout += data.toString("utf8");
              });

            stream.stderr.on("data", (data: Buffer) => {
              stderr += data.toString("utf8");
            });
          });
        })
        .on("error", fail)
        .connect(this.connectConfig());
    });
  }

  private connectConfig(): ConnectConfig {
    return {
      host: this.options.host,
      port: this.options.port,
      username: this.options.username,
      privateKey: readFileSync(this.options.privateKeyPath),
      readyTimeout: this.options.connectTimeoutMs,
    };
  }

  private formatSshCommand(command: string, args: string[]): string {
    return [command, ...args].map((value) => `'${value.replace(/'/g, "'\\''")}'`).join(" ");
  }
}

