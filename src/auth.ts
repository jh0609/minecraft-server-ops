import { CommandInteraction } from "discord.js";

type CommandAccessLevel = "user" | "admin";

const COMMAND_ACCESS: Record<string, CommandAccessLevel> = {
  start: "user",
  status: "user",
  players: "user",
  stop: "admin",
  backup: "admin",
  "status-board": "admin",
};

const getRequiredRoleIds = (): {
  userRoleId: string;
  adminRoleId: string;
} | null => {
  const userRoleId = process.env.DISCORD_USER_ROLE_ID;
  const adminRoleId = process.env.DISCORD_ADMIN_ROLE_ID;

  if (!userRoleId || !adminRoleId) return null;

  return {
    userRoleId,
    adminRoleId,
  };
};

const getMemberRoleIds = (interaction: CommandInteraction): string[] => {
  const member = interaction.member;
  if (!member) return [];

  const roles = member.roles;
  if (Array.isArray(roles)) return roles;

  if ("cache" in roles) {
    return Array.from(roles.cache.keys());
  }

  return [];
};

const deny = async (
  interaction: CommandInteraction,
  content: string
): Promise<void> => {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, ephemeral: true });
    return;
  }

  await interaction.reply({ content, ephemeral: true });
};

export const authorizeCommand = async (
  interaction: CommandInteraction
): Promise<boolean> => {
  const accessLevel = COMMAND_ACCESS[interaction.commandName];
  if (!accessLevel) return true;

  const requiredRoleIds = getRequiredRoleIds();
  if (!requiredRoleIds) {
    await deny(
      interaction,
      "Command authorization is not configured. Please set DISCORD_USER_ROLE_ID and DISCORD_ADMIN_ROLE_ID."
    );
    return false;
  }

  const memberRoleIds = getMemberRoleIds(interaction);
  const hasAdminRole = memberRoleIds.includes(requiredRoleIds.adminRoleId);
  const hasUserRole = memberRoleIds.includes(requiredRoleIds.userRoleId);

  if (accessLevel === "admin" && !hasAdminRole) {
    await deny(interaction, "You need the MC Admin role to use this command.");
    return false;
  }

  if (accessLevel === "user" && !hasUserRole && !hasAdminRole) {
    await deny(
      interaction,
      "You need the MC User or MC Admin role to use this command."
    );
    return false;
  }

  return true;
};

