import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { createRemoteCommandClientFromEnv } from "../adapters/remote/createRemoteCommandClient";
import { RemoteCommandResult } from "../adapters/remote/types";

const data = new SlashCommandBuilder()
  .setName("start")
  .setDescription("Start the Minecraft service");

const MAX_OUTPUT_LENGTH = 1200;

const truncate = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_OUTPUT_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_OUTPUT_LENGTH)}...`;
};

const formatResult = (result: RemoteCommandResult): string => {
  const lines = [
    `command: ${result.command}`,
    `exitCode: ${result.exitCode ?? "none"}`,
    `timedOut: ${result.timedOut}`,
    `durationMs: ${result.durationMs}`,
  ];

  const stdout = truncate(result.stdout);
  const stderr = truncate(result.stderr);

  if (stdout) lines.push(`stdout:\n\`\`\`\n${stdout}\n\`\`\``);
  if (stderr) lines.push(`stderr:\n\`\`\`\n${stderr}\n\`\`\``);

  return lines.join("\n");
};

const execute = async (interaction: CommandInteraction): Promise<void> => {
  await interaction.deferReply();

  try {
    const remoteCommandClient = createRemoteCommandClientFromEnv();
    const result = await remoteCommandClient.run({ script: "start" });
    const formattedResult = formatResult(result);

    if (result.timedOut || result.exitCode !== 0) {
      await interaction.followUp(
        `Minecraft service start failed.\n${formattedResult}`
      );
      return;
    }

    await interaction.followUp(
      `Minecraft service start requested successfully.\n${formattedResult}`
    );
  } catch (error) {
    await interaction.followUp({
      content: `Start command failed.\n${error}`,
      ephemeral: true,
    });
  }
};

export { data, execute };

