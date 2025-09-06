import { handleVoiceXP } from '../features/leveling/levelingSystem.js';
import { onJoin, onLeave, onSwitch } from '../features/leveling/voiceSessionService.js';
import { PermissionsBitField } from 'discord.js';
import { channelsConfig, rolesConfig, getEnvironment } from '../config/configLoader.js';
import logger from '../utils/logger.js';

// Map of level roles in order from lowest to highest
const LEVEL_ROLES_ORDER = [
  'cnsNewcomer',
  'cnsRookie',
  'cnsMember',
  'cnsVeteran',
  'cnsMaster',
  'cnsLegend',
  'cnsExploitDeveloper',
  'whiteHatHacker',
  'blackHatHacker'
];

// Helper function to check if user has required level or higher
const hasRequiredLevel = (member, requiredLevel) => {
  const levelRoles = rolesConfig().levelRoles;
  const requiredIndex = LEVEL_ROLES_ORDER.indexOf(requiredLevel);

  if (requiredIndex === -1) return false;

  // Check if user has the required level or any higher level
  for (let i = requiredIndex; i < LEVEL_ROLES_ORDER.length; i++) {
    const roleKey = LEVEL_ROLES_ORDER[i];
    const roleId = levelRoles[roleKey];
    if (member.roles.cache.has(roleId)) {
      return true;
    }
  }

  return false;
};

export const name = 'voiceStateUpdate';
export const once = false;

// Store created channels and their deletion timers
const createdChannels = new Map();
// Store cooldowns to prevent multiple channel creation
const userCooldowns = new Map();
// Voice session state is managed in voiceSessionService

export const execute = async (oldState, newState) => {
  // Ignore bot voice states
  if (newState.member.user.bot) return;

  // Handle empty channel deletion instantly
  if (oldState.channelId && !newState.channelId) {
    // User left a channel - check if it's one of our created channels
    const leftChannel = oldState.channel;
    if (leftChannel && createdChannels.has(leftChannel.id)) {
      logger.debug(`[JoinToCreate] User left created channel ${leftChannel.name}. Deleting instantly...`);
      try {
        const freshChannel = await leftChannel.fetch();
        if (freshChannel.members.size === 0) {
          await leftChannel.delete('Temporary Join to Create channel cleanup');
          createdChannels.delete(leftChannel.id);
          logger.debug(`[JoinToCreate] Successfully deleted empty channel ${leftChannel.name}`);
        } else {
          logger.debug(`[JoinToCreate] Channel ${leftChannel.name} is not empty (${freshChannel.members.size} members). Keeping it.`);
        }
      } catch (err) {
        logger.error({ err }, '[JoinToCreate] Error checking/deleting empty channel');
        createdChannels.delete(leftChannel.id);
      }
    }
  }

  // Handle joining created channels (cancel deletion timer)
  if (newState.channelId && createdChannels.has(newState.channelId)) {
    const joinedChannel = newState.channel;
    const existingTimer = createdChannels.get(newState.channelId);
    if (existingTimer) {
      logger.debug(`[JoinToCreate] User joined created channel ${joinedChannel.name}. Cancelling deletion timer.`);
      clearTimeout(existingTimer);
      createdChannels.set(newState.channelId, null);
    }
  }

  // Only act on join events
  if (!newState.channelId && !oldState.channelId) return;

  // Join to Create logic with stableTicks polling and move delay
  if (newState.channelId === channelsConfig().joinToCreateChannelId) {
    const member = newState.member;
    const guild = newState.guild;
    const userId = member.id;

    // Require CNS Rookie level OR the CNS Official tag role
    const hasCnsTagRole = member.roles.cache.has(rolesConfig().cnsOfficialRole);
    const isDevEnv = getEnvironment() === 'development';
    if (!isDevEnv && !hasRequiredLevel(member, 'cnsRookie') && !hasCnsTagRole) {
      try {
        await member.send('❌ You need the **CNS Rookie** level (or the **CNS Official** tag role) to create a voice channel.');
      } catch (e) {
        // Ignore DM errors
      }
      logger.debug(`[JoinToCreate] ${member.user.tag} lacks required level and CNS tag role.`);
      return;
    }

    // Check cooldown to prevent multiple channel creation
    const now = Date.now();
    const cooldownTime = userCooldowns.get(userId);
    if (cooldownTime && (now - cooldownTime) < 1000) {
      logger.debug(`[JoinToCreate] ${member.user.tag} is on cooldown. Skipping channel creation.`);
      return;
    }

    logger.debug(`[JoinToCreate] ${member.user.tag} joined the join-to-create channel. Waiting for stable connection...`);

    // Set cooldown
    userCooldowns.set(userId, now);

    let stableTicks = 0;
    let tries = 0;
    const interval = setInterval(async () => {
      tries++;
      const fresh = await guild.members.fetch(userId);
      const chan = fresh.voice.channel;

      if (chan?.id === channelsConfig().joinToCreateChannelId && chan.members.has(userId)) {
        stableTicks++;
      } else {
        stableTicks = 0;
      }

      // Wait for at least 1 stable tick (more permissive), or timeout after 8s
      if (stableTicks >= 1 || tries > 80) {
        clearInterval(interval);

        if (stableTicks < 1) {
          logger.debug(`[JoinToCreate] ${member.user.tag} never stabilized (tries=${tries}). Aborting.`);
          userCooldowns.delete(userId);
          return;
        }

        logger.debug(`[JoinToCreate] ${member.user.tag} is voice-stable! Creating channel and moving...`);

        try {
          // Create the channel using server display name (nickname preferred)
          const display = member.displayName || member.user.username;
          const safeName = display.replace(/[^\p{L}\p{N}\s'_\-]/gu, '');
          const newChannel = await guild.channels.create({
            name: `${safeName}'s Channel`,
            type: 2, // GUILD_VOICE
            parent: channelsConfig().voiceCategoryId,
            permissionOverwrites: [
              {
                id: guild.id,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.Connect,
                  PermissionsBitField.Flags.Speak,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.UseApplicationCommands
                ],
              },
              {
                id: guild.members.me.id,
                allow: [
                  PermissionsBitField.Flags.ManageChannels,
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.Connect,
                  PermissionsBitField.Flags.UseApplicationCommands,
                  PermissionsBitField.Flags.SendMessages
                ],
              },
              {
                id: member.id,
                allow: [
                  PermissionsBitField.Flags.ManageChannels,
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.MuteMembers,
                  PermissionsBitField.Flags.DeafenMembers,
                  PermissionsBitField.Flags.MoveMembers,
                  PermissionsBitField.Flags.Connect,
                  PermissionsBitField.Flags.UseApplicationCommands,
                  PermissionsBitField.Flags.SendMessages
                ],
              },
            ],
          });

          // Mark channel owner for downstream owner checks
          try { voiceRepoAdapter.setOwner(newChannel.id, member.id); } catch {}

          createdChannels.set(newChannel.id, null);

          // Move the user immediately after channel creation
          try {
            // Re-fetch the member to get the latest voice state
            const freshMember = await guild.members.fetch(member.id);
            if (freshMember.voice.channelId === channelsConfig().joinToCreateChannelId) {
              await freshMember.voice.setChannel(newChannel);
              logger.debug(`[JoinToCreate] SUCCESS! Moved ${member.user.tag} to their new channel!`);
            } else {
              logger.warn(`[JoinToCreate] ${member.user.tag} is no longer in the join-to-create channel. Not moving.`);
              // Instantly delete the channel if it's empty
              try {
                const fetchedChannel = await guild.channels.fetch(newChannel.id);
                if (fetchedChannel && fetchedChannel.members.size === 0) {
                  await fetchedChannel.delete('User left before move');
                  createdChannels.delete(newChannel.id);
                  logger.debug(`[JoinToCreate] Deleted unused channel ${newChannel.name}`);
                }
              } catch (err) {
                logger.error({ err }, '[JoinToCreate] Error deleting unused channel');
              }
            }
          } catch (moveError) {
            logger.error({ err: moveError }, `[JoinToCreate] Move failed`);
            logger.debug(`[JoinToCreate] User will need to join manually: ${newChannel.name}`);
          }
        } catch (err) {
          logger.error({ err }, '[JoinToCreate] Error creating channel');
          userCooldowns.delete(userId);
        }
      }
    }, 100);
  }

  try {
    // If user joined a voice channel
    if (!oldState.channelId && newState.channelId) {
      logger.debug(`🎤 ${newState.member.user.tag} joined voice channel: ${newState.channel ? newState.channel.name : 'Unknown Channel'}`);
      onJoin(newState.member);
    }
    // If user left a voice channel
    if (oldState.channelId && !newState.channelId) {
      logger.debug(`👋 ${oldState.member.user.tag} left voice channel: ${oldState.channel ? oldState.channel.name : 'Unknown Channel'}`);
      onLeave(oldState.member);
    }
    // If user switched channels
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      onSwitch(oldState.member, newState.member);
    }
  } catch (error) {
    logger.error({ err: error }, 'Error handling voice state update');
  }
}; 