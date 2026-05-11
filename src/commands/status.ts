import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import {
  createRemoteCommandClientFromEnv,
  getRemoteCommandMode,
} from "../adapters/remote/createRemoteCommandClient";

const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Show the current Minecraft operations status");

const MAX_OUTPUT_LENGTH = 500;

type PlayerCount = {
  online: number;
  max: number;
};

const truncate = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_OUTPUT_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_OUTPUT_LENGTH)}...`;
};

const parsePlayerCount = (stdout: string): PlayerCount | null => {
  const match = stdout.match(
    /There are\s+(\d+)\s+of\s+a\s+max\s+of\s+(\d+)\s+players online:/i
  );

  if (!match) return null;

  return {
    online: Number.parseInt(match[1], 10),
    max: Number.parseInt(match[2], 10),
  };
};

const execute = async (interaction: CommandInteraction): Promise<void> => {
  await interaction.deferReply();

  try {
    const remoteCommandMode = getRemoteCommandMode();
    const remoteCommandClient = createRemoteCommandClientFromEnv();
    const result = await remoteCommandClient.run({ script: "players" });
    const lines = [
      `Remote command mode: ${remoteCommandMode}`,
      "GCE VM shutdown integration: disabled",
      "Safe stop command: /stop",
    ];

    if (result.timedOut || result.exitCode !== 0) {
      lines.unshift("Minecraft service: appears inactive or unavailable");
      lines.push(`Player count: unavailable`);
      lines.push(`player check exitCode: ${result.exitCode ?? "none"}`);
      lines.push(`player check timedOut: ${result.timedOut}`);

      const stderr = truncate(result.stderr);
      const stdout = truncate(result.stdout);
      if (stderr) lines.push(`stderr:\n\`\`\`\n${stderr}\n\`\`\``);
      if (stdout) lines.push(`stdout:\n\`\`\`\n${stdout}\n\`\`\``);

      await interaction.followUp(lines.join("\n"));
      return;
    }

    const playerCount = parsePlayerCount(result.stdout);
    if (!playerCount) {
      lines.unshift("Minecraft service: appears active, but player count parsing failed");
      lines.push("Player count: unavailable");
      lines.push("raw stdout:");
      lines.push("```");
      lines.push(truncate(result.stdout) || "(empty)");
      lines.push("```");

      await interaction.followUp(lines.join("\n"));
      return;
    }

    lines.unshift("Minecraft service: appears active");
    lines.push(`Online players: ${playerCount.online} / ${playerCount.max}`);

    await interaction.followUp(lines.join("\n"));
  } catch (error) {
    await interaction.followUp({
      content: `Status command failed.\n${error}`,
      ephemeral: true,
    });
  }
};

export { data, execute };

