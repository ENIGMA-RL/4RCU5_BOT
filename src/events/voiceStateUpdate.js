import { handleVoiceXP } from '../features/leveling/levelingSystem.js';
import { PermissionsBitField } from 'discord.js';
import { channelsConfig, rolesConfig } from '../config/configLoader.js';

export const name = 'voiceStateUpdate';
export const once = false;

// Store created channels and their deletion timers
const createdChannels = new Map();
// Store cooldowns to prevent multiple channel creation
const userCooldowns = new Map();
// Store per-user voice join timestamps and XP timers
const voiceSessionMap = new Map(); // userId -> { joinTimestamp, lastAwardedMinute, interval }

export const execute = async (oldState, newState) => {
  // Ignore bot voice states
  if (newState.member.user.bot) return;

  // Handle empty channel deletion instantly
  if (oldState.channelId && !newState.channelId) {
    // User left a channel - check if it's one of our created channels
    const leftChannel = oldState.channel;
    if (leftChannel && createdChannels.has(leftChannel.id)) {
      console.log(`[JoinToCreate] User left created channel ${leftChannel.name}. Deleting instantly...`);
      try {
        const freshChannel = await leftChannel.fetch();
        if (freshChannel.members.size === 0) {
          await leftChannel.delete('Temporary Join to Create channel cleanup');
          createdChannels.delete(leftChannel.id);
          console.log(`[JoinToCreate] Successfully deleted empty channel ${leftChannel.name}`);
        } else {
          console.log(`[JoinToCreate] Channel ${leftChannel.name} is not empty (${freshChannel.members.size} members). Keeping it.`);
        }
      } catch (err) {
        console.error(`[JoinToCreate] Error checking/deleting empty channel:`, err);
        createdChannels.delete(leftChannel.id);
      }
    }
  }

  // Handle joining created channels (cancel deletion timer)
  if (newState.channelId && createdChannels.has(newState.channelId)) {
    const joinedChannel = newState.channel;
    const existingTimer = createdChannels.get(newState.channelId);
    if (existingTimer) {
      console.log(`[JoinToCreate] User joined created channel ${joinedChannel.name}. Cancelling deletion timer.`);
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

    // CNS Rookie role check
    const rookieRoleId = rolesConfig().levelRoles.cnsRookie;
    if (!member.roles.cache.has(rookieRoleId)) {
      try {
        await member.send('❌ You need to reach the **CNS Rookie** level to create a voice channel.');
      } catch (e) {
        // Ignore DM errors
      }
      console.log(`[JoinToCreate] ${member.user.tag} tried to create a channel but lacks CNS Rookie role.`);
      return;
    }

    // Check cooldown to prevent multiple channel creation
    const now = Date.now();
    const cooldownTime = userCooldowns.get(userId);
    if (cooldownTime && (now - cooldownTime) < 1000) {
      console.log(`[JoinToCreate] ${member.user.tag} is on cooldown. Skipping channel creation.`);
      return;
    }

    console.log(`[JoinToCreate] ${member.user.tag} joined the join-to-create channel. Waiting for stable connection...`);

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

      // Wait for 2 stable ticks in a row before proceeding
      if (stableTicks >= 2 || tries > 30) {
        clearInterval(interval);

        if (stableTicks < 2) {
          console.log(`[JoinToCreate] ${member.user.tag} never stabilized. Aborting.`);
          return;
        }

        console.log(`[JoinToCreate] ${member.user.tag} is voice-stable! Creating channel and moving...`);

        try {
          // Create the channel with just the username (no icon)
          const newChannel = await guild.channels.create({
            name: `${member.user.username}'s Channel`,
            type: 2, // GUILD_VOICE
            parent: channelsConfig().voiceCategoryId,
            permissionOverwrites: [
              {
                id: guild.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],
              },
              {
                id: member.id,
                allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MuteMembers, PermissionsBitField.Flags.DeafenMembers],
              },
            ],
          });

          createdChannels.set(newChannel.id, null);

          // Move the user immediately after channel creation
          try {
            // Re-fetch the member to get the latest voice state
            const freshMember = await guild.members.fetch(member.id);
            if (freshMember.voice.channelId === channelsConfig().joinToCreateChannelId) {
              await freshMember.voice.setChannel(newChannel);
              console.log(`[JoinToCreate] SUCCESS! Moved ${member.user.tag} to their new channel!`);
            } else {
              console.warn(`[JoinToCreate] ${member.user.tag} is no longer in the join-to-create channel. Not moving.`);
              // Instantly delete the channel if it's empty
              try {
                const fetchedChannel = await guild.channels.fetch(newChannel.id);
                if (fetchedChannel && fetchedChannel.members.size === 0) {
                  await fetchedChannel.delete('User left before move');
                  createdChannels.delete(newChannel.id);
                  console.log(`[JoinToCreate] Deleted unused channel ${newChannel.name}`);
                }
              } catch (err) {
                console.error(`[JoinToCreate] Error deleting unused channel:`, err);
              }
            }
          } catch (moveError) {
            console.error(`[JoinToCreate] Move failed: ${moveError.message}`);
            console.log(`[JoinToCreate] User will need to join manually: ${newChannel.name}`);
          }
        } catch (err) {
          console.error(`[JoinToCreate] Error creating channel:`, err);
          userCooldowns.delete(userId);
        }
      }
    }, 100);
  }

  try {
    // If user joined a voice channel
    if (!oldState.channelId && newState.channelId) {
      console.log(`🎤 ${newState.member.user.tag} joined voice channel: ${newState.channel ? newState.channel.name : 'Unknown Channel'}`);
      // Start tracking join time and set up interval for periodic XP
      const userId = newState.member.id;
      const now = Date.now();
      // If already tracking, clear previous interval
      if (voiceSessionMap.has(userId)) {
        clearInterval(voiceSessionMap.get(userId).interval);
      }
      // Set up interval to award XP every minute
      const interval = setInterval(async () => {
        const session = voiceSessionMap.get(userId);
        if (!session) return;
        const minutes = Math.floor((Date.now() - session.joinTimestamp) / 60000);
        if (minutes > session.lastAwardedMinute) {
          // Award XP for each new minute
          for (let i = session.lastAwardedMinute + 1; i <= minutes; i++) {
            await handleVoiceXP(newState.member);
          }
          session.lastAwardedMinute = minutes;
        }
      }, 15000); // check every 15 seconds
      voiceSessionMap.set(userId, {
        joinTimestamp: now,
        lastAwardedMinute: 0,
        interval
      });
    }
    // If user left a voice channel
    if (oldState.channelId && !newState.channelId) {
      console.log(`👋 ${oldState.member.user.tag} left voice channel: ${oldState.channel ? oldState.channel.name : 'Unknown Channel'}`);
      // Award XP for any remaining full minutes
      const userId = oldState.member.id;
      const session = voiceSessionMap.get(userId);
      if (session) {
        const minutes = Math.floor((Date.now() - session.joinTimestamp) / 60000);
        for (let i = session.lastAwardedMinute + 1; i <= minutes; i++) {
          await handleVoiceXP(oldState.member);
        }
        clearInterval(session.interval);
        voiceSessionMap.delete(userId);
      }
    }
    // If user switched channels
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      // Treat as leave + join
      // Award XP for any remaining full minutes in old channel
      const userId = oldState.member.id;
      const session = voiceSessionMap.get(userId);
      if (session) {
        const minutes = Math.floor((Date.now() - session.joinTimestamp) / 60000);
        for (let i = session.lastAwardedMinute + 1; i <= minutes; i++) {
          await handleVoiceXP(oldState.member);
        }
        clearInterval(session.interval);
        voiceSessionMap.delete(userId);
      }
      // Start new session for new channel
      const now = Date.now();
      const interval = setInterval(async () => {
        const session = voiceSessionMap.get(userId);
        if (!session) return;
        const minutes = Math.floor((Date.now() - session.joinTimestamp) / 60000);
        if (minutes > session.lastAwardedMinute) {
          for (let i = session.lastAwardedMinute + 1; i <= minutes; i++) {
            await handleVoiceXP(newState.member);
          }
          session.lastAwardedMinute = minutes;
        }
      }, 15000);
      voiceSessionMap.set(userId, {
        joinTimestamp: now,
        lastAwardedMinute: 0,
        interval
      });
    }
  } catch (error) {
    console.error('Error handling voice state update:', error);
  }
}; 