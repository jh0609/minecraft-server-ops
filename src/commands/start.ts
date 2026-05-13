import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { getMetadataToken, getVmConfig, startInstance } from "../services/gceVm";

const data = new SlashCommandBuilder()
  .setName("start")
  .setDescription("Start the Minecraft VM");

const execute = async (interaction: CommandInteraction): Promise<void> => {
  await interaction.deferReply();

  try {
    const accessToken = await getMetadataToken();
    const response = await startInstance(accessToken);
    const operation = response.body;
    const vmConfig = getVmConfig();

    await interaction.followUp(
      [
        "Minecraft VM start requested successfully.",
        `instance: ${vmConfig.instance}`,
        `zone: ${vmConfig.zone}`,
        `operationStatus: ${operation.status ?? "unknown"}`,
        operation.name ? `operationName: ${operation.name}` : undefined,
      ]
        .filter(Boolean)
        .join("\n")
    );
  } catch (error) {
    await interaction.followUp({
      content: `Minecraft VM start failed.\n${error}`,
      ephemeral: true,
    });
  }
};

export { data, execute };
