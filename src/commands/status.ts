import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import {
  collectMinecraftStatus,
  formatStatusLines,
} from "../services/minecraftStatus";

const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Show the current Minecraft operations status");

const execute = async (interaction: CommandInteraction): Promise<void> => {
  await interaction.deferReply();

  try {
    const snapshot = await collectMinecraftStatus();
    const lines = formatStatusLines(snapshot);
    lines.push("Safe stop command: /stop");
    await interaction.followUp(lines.join("\n"));
  } catch (error) {
    await interaction.followUp({
      content: `Status command failed.\n${error}`,
      ephemeral: true,
    });
  }
};

export { data, execute };
