export type RemoteScriptName = "backup";

export type RemoteCommandRequest = {
  script: RemoteScriptName;
  timeoutMs?: number;
};

export type RemoteCommandResult = {
  script: RemoteScriptName;
  command: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

export interface RemoteCommandClient {
  run(request: RemoteCommandRequest): Promise<RemoteCommandResult>;
}

