import { promises as fs } from "fs";
import * as path from "path";
import { Client, TextChannel } from "discord.js";
import {
  collectMinecraftStatus,
  formatPresenceText,
  formatUserFacingStatusLines,
} from "./services/minecraftStatus";

const STATUS_BOARD_PATH = path.resolve("data", "status-board.json");
const UPDATE_INTERVAL_MS = 60_000;

type StatusBoardRecord = {
  channelId: string;
  messageId: string;
};

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

const renderStatusBoard = async (): Promise<string> => {
  const snapshot = await collectMinecraftStatus();
  const now = new Date();
  return [
    "**Minecraft Ops Status**",
    ...formatUserFacingStatusLines(snapshot, now),
  ].join("\n");
};

const updatePresence = async (client: Client): Promise<void> => {
  const snapshot = await collectMinecraftStatus();
  await client.user?.setPresence({
    activities: [{ name: formatPresenceText(snapshot), type: "PLAYING" }],
    status: "online",
  });
};

export const updateStatusBoardMessage = async (
  client: Client
): Promise<void> => {
  const record = await readStatusBoardRecord();
  if (!record) return;

  const channel = await client.channels.fetch(record.channelId);
  if (!channel || !channel.isText()) return;

  const message = await (channel as TextChannel).messages.fetch(record.messageId);
  await message.edit(await renderStatusBoard());
};

export const createOrUpdateStatusBoard = async (
  client: Client,
  channel: TextChannel
): Promise<void> => {
  const record = await readStatusBoardRecord();
  const content = await renderStatusBoard();

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
  const update = async () => {
    try {
      await updateStatusBoardMessage(client);
      await updatePresence(client);
    } catch (error) {
      console.error("status board update failed", error);
    }
  };

  void update();
  setInterval(() => {
    void update();
  }, UPDATE_INTERVAL_MS);
};
