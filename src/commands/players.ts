import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { createRemoteCommandClientFromEnv } from "../adapters/remote/createRemoteCommandClient";

const data = new SlashCommandBuilder()
  .setName("players")
  .setDescription("Show the current Minecraft player count");

const MAX_RAW_OUTPUT_LENGTH = 500;

type PlayerCount = {
  online: number;
  max: number;
};

const truncate = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_RAW_OUTPUT_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_RAW_OUTPUT_LENGTH)}...`;
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
    const remoteCommandClient = createRemoteCommandClientFromEnv();
    const result = await remoteCommandClient.run({ script: "players" });

    if (result.timedOut || result.exitCode !== 0) {
      await interaction.followUp(
        [
          "Player check failed.",
          `exitCode: ${result.exitCode ?? "none"}`,
          `timedOut: ${result.timedOut}`,
          result.stderr.trim()
            ? `stderr:\n\`\`\`\n${truncate(result.stderr)}\n\`\`\``
            : undefined,
          result.stdout.trim()
            ? `stdout:\n\`\`\`\n${truncate(result.stdout)}\n\`\`\``
            : undefined,
        ]
          .filter(Boolean)
          .join("\n")
      );
      return;
    }

    const playerCount = parsePlayerCount(result.stdout);
    if (!playerCount) {
      await interaction.followUp(
        [
          "Player count parse failed.",
          "raw stdout:",
          "```",
          truncate(result.stdout) || "(empty)",
          "```",
        ].join("\n")
      );
      return;
    }

    await interaction.followUp(
      `Online players: ${playerCount.online} / ${playerCount.max}`
    );
  } catch (error) {
    await interaction.followUp({
      content: `Player check command failed.\n${error}`,
      ephemeral: true,
    });
  }
};

export { data, execute };

