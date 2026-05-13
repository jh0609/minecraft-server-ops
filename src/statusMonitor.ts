import { collectMinecraftStatus, MinecraftStatusSnapshot } from "./services/minecraftStatus";

export type StatusMonitorUpdate = {
  snapshot: MinecraftStatusSnapshot;
  collectedAt: Date;
};

type StatusMonitorListener = (update: StatusMonitorUpdate) => void | Promise<void>;

const DEFAULT_STATUS_INTERVAL_SECONDS = 60;

const optionalIntegerEnv = (name: string, defaultValue: number): number => {
  const value = process.env[name];
  if (!value) return defaultValue;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
};

export const getStatusMonitorIntervalMs = (): number =>
  optionalIntegerEnv(
    "IDLE_CHECK_INTERVAL_SECONDS",
    DEFAULT_STATUS_INTERVAL_SECONDS
  ) * 1000;

export class StatusMonitor {
  private latestUpdate: StatusMonitorUpdate | null = null;
  private interval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private readonly listeners = new Set<StatusMonitorListener>();

  constructor(private readonly intervalMs: number) {}

  getLatestUpdate(): StatusMonitorUpdate | null {
    return this.latestUpdate;
  }

  subscribe(listener: StatusMonitorListener): void {
    this.listeners.add(listener);
  }

  start(): void {
    if (this.interval) return;

    void this.poll();
    this.interval = setInterval(() => {
      void this.poll();
    }, this.intervalMs);
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const update = {
        snapshot: await collectMinecraftStatus(),
        collectedAt: new Date(),
      };
      this.latestUpdate = update;

      for (const listener of this.listeners) {
        await listener(update);
      }
    } catch (error) {
      console.error("status monitor update failed", error);
    } finally {
      this.isPolling = false;
    }
  }
}

