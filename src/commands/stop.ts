import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { createRemoteCommandClientFromEnv } from "../adapters/remote/createRemoteCommandClient";
import { RemoteCommandResult } from "../adapters/remote/types";

const data = new SlashCommandBuilder()
  .setName("stop")
  .setDescription("Run the Minecraft safe stop script");

const MAX_OUTPUT_LENGTH = 1200;

const EXIT_CODE_MESSAGES: Record<number, string> = {
  10: "Players are online; stop was refused.",
  20: "RCON is unavailable.",
  30: "save-all failed.",
  40: "Backup failed.",
  50: "Minecraft stop failed.",
  60: "Timed out waiting for the Minecraft service to stop.",
  70: "Invalid safe-stop configuration.",
  80: "Another safe-stop operation is already running.",
};

const truncate = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_OUTPUT_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_OUTPUT_LENGTH)}...`;
};

const formatResult = (result: RemoteCommandResult): string => {
  const lines = [
    `script: ${result.command}`,
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

const failureMessageFor = (result: RemoteCommandResult): string => {
  if (result.timedOut) return "Safe stop timed out.";
  if (result.exitCode === null) return "Safe stop did not return an exit code.";

  return (
    EXIT_CODE_MESSAGES[result.exitCode] ??
    `Safe stop failed with exit code ${result.exitCode}.`
  );
};

const execute = async (interaction: CommandInteraction): Promise<void> => {
  await interaction.deferReply();

  try {
    const remoteCommandClient = createRemoteCommandClientFromEnv();
    const result = await remoteCommandClient.run({ script: "stop" });
    const formattedResult = formatResult(result);

    if (result.timedOut || result.exitCode !== 0) {
      await interaction.followUp(
        `${failureMessageFor(result)}\nGCE VM shutdown was not requested.\n${formattedResult}`
      );
      return;
    }

    await interaction.followUp(
      `Safe stop completed successfully. GCE VM shutdown was not requested.\n${formattedResult}`
    );
  } catch (error) {
    await interaction.followUp({
      content: `Safe stop command failed. GCE VM shutdown was not requested.\n${error}`,
      ephemeral: true,
    });
  }
};

export { data, execute };

