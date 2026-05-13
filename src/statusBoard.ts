import { promises as fs } from "fs";
import * as path from "path";
import { Client, TextChannel } from "discord.js";
import {
  collectMinecraftStatus,
  formatPresenceText,
  formatUserFacingStatusLines,
  MinecraftStatusSnapshot,
} from "./services/minecraftStatus";
import { IdleAutoStop } from "./idleAutoStop";
import {
  getStatusMonitorIntervalMs,
  StatusMonitor,
  StatusMonitorUpdate,
} from "./statusMonitor";

const STATUS_BOARD_PATH = path.resolve("data", "status-board.json");

type StatusBoardRecord = {
  channelId: string;
  messageId: string;
};

const monitor = new StatusMonitor(getStatusMonitorIntervalMs());
const idleAutoStop = new IdleAutoStop(monitor);
let servicesStarted = false;

export const getStatusBoardServices = (): {
  monitor: StatusMonitor;
  idleAutoStop: IdleAutoStop;
} => ({
  monitor,
  idleAutoStop,
});

const readStatusBoardRecord = async (): Promise<StatusBoardRecord | null> => {
  try {
    const raw = await fs.readFile(STATUS_BOARD_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StatusBoardRecord>;
    if (!parsed.channelId || !parsed.messageId) return null;
    return {
      channelId: parsed.channelId,
      messageId: parsed.messageId,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") return null;
    throw error;
  }
};

const writeStatusBoardRecord = async (
  record: StatusBoardRecord
): Promise<void> => {
  await fs.mkdir(path.dirname(STATUS_BOARD_PATH), { recursive: true });
  await fs.writeFile(STATUS_BOARD_PATH, JSON.stringify(record, null, 2), "utf8");
};

const renderStatusBoard = (snapshot: MinecraftStatusSnapshot): string => {
  const now = new Date();
  return [
    "**Minecraft Ops Status**",
    ...formatUserFacingStatusLines(snapshot, now),
  ].join("\n");
};

const renderStatusBoardWithIdle = (
  update: StatusMonitorUpdate,
  idleAutoStop: IdleAutoStop
): string => [
  "**Minecraft Ops Status**",
  ...formatUserFacingStatusLines(update.snapshot, update.collectedAt),
  formatIdleAutoStopLine(idleAutoStop),
].join("\n");

const formatIdleAutoStopLine = (idleAutoStop: IdleAutoStop): string => {
  const state = idleAutoStop.getState();
  if (!state.enabled) return "Auto-stop: disabled";
  if (state.stopping) return "Auto-stop: enabled · stopping";
  return `Auto-stop: enabled · idle ${state.idleMinutes}/${state.thresholdMinutes} min`;
};

const updatePresence = async (
  client: Client,
  snapshot: MinecraftStatusSnapshot
): Promise<void> => {
  await client.user?.setPresence({
    activities: [{ name: formatPresenceText(snapshot), type: "PLAYING" }],
    status: "online",
  });
};

export const updateStatusBoardMessage = async (
  client: Client,
  update: StatusMonitorUpdate,
  idleAutoStop: IdleAutoStop
): Promise<void> => {
  const record = await readStatusBoardRecord();
  if (!record) return;

  const channel = await client.channels.fetch(record.channelId);
  if (!channel || !channel.isText()) return;

  const message = await (channel as TextChannel).messages.fetch(record.messageId);
  await message.edit(renderStatusBoardWithIdle(update, idleAutoStop));
};

export const createOrUpdateStatusBoard = async (
  client: Client,
  channel: TextChannel,
  monitor: StatusMonitor,
  idleAutoStop: IdleAutoStop
): Promise<void> => {
  const record = await readStatusBoardRecord();
  const latestUpdate = monitor.getLatestUpdate();
  const content = latestUpdate
    ? renderStatusBoardWithIdle(latestUpdate, idleAutoStop)
    : renderStatusBoard(await collectMinecraftStatus());

  if (record && record.channelId === channel.id) {
    try {
      const existingMessage = await channel.messages.fetch(record.messageId);
      await existingMessage.edit(content);
      return;
    } catch (error) {
      // Fall through and create a replacement message.
    }
  }

  const message = await channel.send(content);
  await writeStatusBoardRecord({
    channelId: channel.id,
    messageId: message.id,
  });
};

export const startStatusBoardUpdater = (client: Client): void => {
  if (servicesStarted) return;
  servicesStarted = true;

  idleAutoStop.start();

  monitor.subscribe(async (update) => {
    try {
      await updateStatusBoardMessage(client, update, idleAutoStop);
    } catch (error) {
      console.error("status board update failed", error);
    }

    try {
      await updatePresence(client, update.snapshot);
    } catch (error) {
      console.error("presence update failed", error);
    }
  });

  monitor.start();
};
