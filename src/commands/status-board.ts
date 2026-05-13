import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, TextChannel } from "discord.js";
import { createOrUpdateStatusBoard } from "../statusBoard";

const data = new SlashCommandBuilder()
  .setName("status-board")
  .setDescription("Manage the periodic status board")
  .addSubcommand((subcommand) =>
    subcommand.setName("create").setDescription("Create or update the status board")
  );

const execute = async (interaction: CommandInteraction): Promise<void> => {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.channel || !interaction.channel.isText()) {
    await interaction.followUp({
      content: "Status board can only be created in a text channel.",
      ephemeral: true,
    });
    return;
  }

  await createOrUpdateStatusBoard(
    interaction.client,
    interaction.channel as TextChannel
  );

  await interaction.followUp({
    content: "Status board created or updated in this channel.",
    ephemeral: true,
  });
};

export { data, execute };

