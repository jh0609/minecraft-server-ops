import { Client, Intents } from "discord.js";
import { authorizeCommand } from "./auth";
import * as commands from "./commands";
import { startStatusBoardUpdater } from "./statusBoard";

const discordClient = new Client({ intents: [Intents.FLAGS.GUILDS] });

discordClient.once("ready", () => {
  console.log("I am ready!");
  startStatusBoardUpdater(discordClient);
});

discordClient.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const command = Object.values(commands).find(
    (candidate) => candidate.data.toJSON().name === interaction.commandName
  );
  if (!command) return;

  if (!(await authorizeCommand(interaction))) return;

  await command.execute(interaction);
});

discordClient.login(process.env.DISCORD_BOT_TOKEN);
