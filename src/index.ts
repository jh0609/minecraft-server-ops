import { Client, Intents } from "discord.js";
import * as commands from "./commands";
import { startStatusBoardUpdater } from "./statusBoard";

const discordClient = new Client({ intents: [Intents.FLAGS.GUILDS] });

discordClient.once("ready", () => {
  console.log("I am ready!");
  startStatusBoardUpdater(discordClient);
});

discordClient.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  await Object.entries(commands)
    .find(([, command]) => command.data.toJSON().name === interaction.commandName)
    ?.[1]
    .execute(interaction);
});

discordClient.login(process.env.DISCORD_BOT_TOKEN);
