import { createRemoteCommandClientFromEnv } from "./adapters/remote/createRemoteCommandClient";
import { MinecraftStatusSnapshot } from "./services/minecraftStatus";
import { StatusMonitor, StatusMonitorUpdate } from "./statusMonitor";

export type IdleAutoStopState = {
  enabled: boolean;
  thresholdMinutes: number;
  idleMinutes: number;
  stopping: boolean;
};

const DEFAULT_IDLE_AUTO_STOP_MINUTES = 30;

const isEnabled = (value: string | undefined): boolean => value === "true";

const optionalIntegerEnv = (name: string, defaultValue: number): number => {
  const value = process.env[name];
  if (!value) return defaultValue;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
};

const isConfirmedIdle = (snapshot: MinecraftStatusSnapshot): boolean =>
  snapshot.vmStatus === "RUNNING" &&
  snapshot.minecraftStatus === "active" &&
  snapshot.playerCount !== null &&
  snapshot.playerCount.online === 0;

export class IdleAutoStop {
  private idleSinceMs: number | null = null;
  private stopping = false;
  private readonly enabled = isEnabled(process.env.IDLE_AUTO_STOP_ENABLED);
  private readonly thresholdMinutes = optionalIntegerEnv(
    "IDLE_AUTO_STOP_MINUTES",
    DEFAULT_IDLE_AUTO_STOP_MINUTES
  );

  constructor(private readonly monitor: StatusMonitor) {}

  start(): void {
    this.monitor.subscribe((update) => this.handleStatusUpdate(update));
  }

  getState(now = Date.now()): IdleAutoStopState {
    return {
      enabled: this.enabled,
      thresholdMinutes: this.thresholdMinutes,
      idleMinutes: this.idleSinceMs
        ? Math.floor((now - this.idleSinceMs) / 60_000)
        : 0,
      stopping: this.stopping,
    };
  }

  private async handleStatusUpdate(update: StatusMonitorUpdate): Promise<void> {
    if (!this.enabled || this.stopping) return;

    const now = update.collectedAt.getTime();
    if (!isConfirmedIdle(update.snapshot)) {
      this.idleSinceMs = null;
      return;
    }

    if (!this.idleSinceMs) {
      this.idleSinceMs = now;
      return;
    }

    const idleMs = now - this.idleSinceMs;
    if (idleMs < this.thresholdMinutes * 60_000) return;

    this.stopping = true;
    void this.runAutoStop();
  }

  private async runAutoStop(): Promise<void> {
    try {
      const remoteCommandClient = createRemoteCommandClientFromEnv();
      const result = await remoteCommandClient.run({ script: "stop" });
      if (result.timedOut || result.exitCode !== 0) {
        console.error(
          `idle auto-stop failed: exitCode=${result.exitCode ?? "none"} timedOut=${result.timedOut}`
        );
      }
    } catch (error) {
      console.error("idle auto-stop failed", error);
    } finally {
      this.idleSinceMs = null;
      this.stopping = false;
    }
  }
}
