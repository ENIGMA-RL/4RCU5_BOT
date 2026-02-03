import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createUser, getUser, markUserActive } from '../../repositories/usersRepo.js';
import { getAllUsers, markUserLeftServer } from '../../repositories/usersAdminRepo.js';
import { syncLevelRoles } from '../../features/leveling/levelRoleSync.js';
import { calculateLevel } from '../../features/leveling/levelingSystem.js';
import { rolesConfig, levelSettingsConfig } from '../../config/configLoader.js';
import logger from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('sync-database')
  .setDescription('🔧 [DEVELOPER ONLY] Comprehensive database synchronization')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export const execute = async (interaction) => {
  // Check if user is developer/admin
  const member = interaction.member;
  const adminRoles = rolesConfig().adminRoles || [];
  const isAdmin = member.roles.cache.some(role => adminRoles.includes(role.id));
  
  if (!isAdmin) {
    return interaction.reply({
      content: '❌ This command is restricted to administrators only.',
      flags: 64
    });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const guild = interaction.guild;
    const startTime = Date.now();
    
    logger.info('🔄 Starting comprehensive database sync...');
    
    // Step 1: Fetch all guild members
    logger.info('📥 Fetching all guild members...');
    await guild.members.fetch();
    const presentMemberIds = new Set(guild.members.cache.keys());
    logger.info(`✅ Fetched ${presentMemberIds.size} guild members`);
    
    // Step 2: Get all users from database
    logger.info('📊 Loading all users from database...');
    const allUsers = getAllUsers();
    logger.info(`✅ Loaded ${allUsers.length} users from database`);
    
    let stats = {
      usersProcessed: 0,
      usersAdded: 0,
      usersMarkedLeft: 0,
      usersMarkedActive: 0,
      levelsRecalculated: 0,
      cnsTagEquipped: 0,
      cnsTagUnequipped: 0,
      errors: []
    };
    
    // Step 3: Process all users in database
    logger.info('🔄 Processing users in database...');
    
    for (const user of allUsers) {
      try {
        stats.usersProcessed++;
        
        const isInServer = presentMemberIds.has(user.user_id);
        const member = isInServer ? guild.members.cache.get(user.user_id) : null;
        
        // Step 3a: Handle left_server status
        if (isInServer && user.left_server === 1) {
          // User is in server but marked as left - fix this
          markUserActive(user.user_id, member.user.username, member.user.displayAvatarURL({ extension: 'png' }));
          stats.usersMarkedActive++;
          logger.debug(`✅ Marked user ${user.user_id} as active (was marked as left)`);
        } else if (!isInServer && user.left_server === 0) {
          // User is not in server but marked as active - mark as left
          markUserLeftServer(user.user_id);
          stats.usersMarkedLeft++;
          logger.debug(`✅ Marked user ${user.user_id} as left server`);
        }
        
        // Step 3b: ALWAYS recalculate levels based on XP (force update)
        const messageXP = user.xp || 0;
        const voiceXP = user.voice_xp || 0;
        const totalXP = messageXP + voiceXP;
        
        const leveling = levelSettingsConfig().leveling;
        const calculatedMessageLevel = calculateLevel(messageXP, leveling.xpThresholds);
        const calculatedVoiceLevel = calculateLevel(voiceXP, leveling.xpThresholds);
        const calculatedTotalLevel = calculateLevel(totalXP, leveling.xpThresholds);
        
        // ALWAYS update levels (force recalculation)
        const updateStmt = `
          UPDATE users 
          SET level = ?, voice_level = ?, total_level = ? 
          WHERE user_id = ?
        `;
        
        // We need to import db for this direct query
        const { default: db } = await import('../../database/connection.js');
        db.prepare(updateStmt).run(
          calculatedMessageLevel,
          calculatedVoiceLevel, 
          calculatedTotalLevel,
          user.user_id
        );
        
        stats.levelsRecalculated++;
        logger.debug(`✅ FORCED level update for user ${user.user_id}: M${calculatedMessageLevel} V${calculatedVoiceLevel} T${calculatedTotalLevel} (XP: ${totalXP})`);
        
        // Step 3c: Handle CNS tag status (only if user is in server)
        if (isInServer && member) {
          const cnsTagRoleId = rolesConfig().cnsOfficialRole;
          const hasCnsTag = member.roles.cache.has(cnsTagRoleId);
          const currentTime = Math.floor(Date.now() / 1000);
          
          if (hasCnsTag && !user.cns_tag_equipped_at) {
            // User has tag but no equipped timestamp - set it
            const updateStmt = `UPDATE users SET cns_tag_equipped_at = ? WHERE user_id = ?`;
            const { default: db } = await import('../../database/connection.js');
            db.prepare(updateStmt).run(currentTime, user.user_id);
            stats.cnsTagEquipped++;
            logger.debug(`✅ Set cns_tag_equipped_at for user ${user.user_id}`);
          } else if (!hasCnsTag && user.cns_tag_equipped_at && !user.cns_tag_unequipped_at) {
            // User doesn't have tag but has equipped timestamp - set unequipped
            const updateStmt = `UPDATE users SET cns_tag_unequipped_at = ? WHERE user_id = ?`;
            const { default: db } = await import('../../database/connection.js');
            db.prepare(updateStmt).run(currentTime, user.user_id);
            stats.cnsTagUnequipped++;
            logger.debug(`✅ Set cns_tag_unequipped_at for user ${user.user_id}`);
          }
        }
        
      } catch (error) {
        stats.errors.push(`User ${user.user_id}: ${error.message}`);
        logger.error({ err: error, userId: user.user_id }, 'Error processing user in sync');
      }
    }
    
    // Step 4: Add missing users who are in server but not in database
    logger.info('➕ Adding missing users to database...');
    
    for (const memberId of presentMemberIds) {
      const existingUser = allUsers.find(u => u.user_id === memberId);
      if (!existingUser) {
        const member = guild.members.cache.get(memberId);
        if (member && !member.user.bot) {
          createUser(
            member.id,
            member.user.username,
            member.user.discriminator,
            member.user.displayAvatarURL({ extension: 'png' })
          );
          markUserActive(member.id, member.user.username, member.user.displayAvatarURL({ extension: 'png' }));
          stats.usersAdded++;
          logger.debug(`✅ Added new user ${member.user.tag} to database`);
        }
      }
    }
    
    // Step 5: Run level role sync
    logger.info('🎭 Running level role synchronization...');
    const roleSyncResult = await syncLevelRoles(guild);
    logger.info(`✅ Level role sync completed: ${roleSyncResult.added} added, ${roleSyncResult.removed} removed`);
    
    const duration = Date.now() - startTime;
    
    // Create summary embed
    const embed = {
      title: '🔧 Database Sync Complete',
      color: 0x00ff00,
      fields: [
        {
          name: '📊 Processing Stats',
          value: `• Users processed: ${stats.usersProcessed}\n• Users added: ${stats.usersAdded}\n• Marked as active: ${stats.usersMarkedActive}\n• Marked as left: ${stats.usersMarkedLeft}`,
          inline: true
        },
        {
          name: '🎯 Level Updates',
          value: `• Levels recalculated: ${stats.levelsRecalculated}\n• CNS tags equipped: ${stats.cnsTagEquipped}\n• CNS tags unequipped: ${stats.cnsTagUnequipped}`,
          inline: true
        },
        {
          name: '🎭 Role Sync',
          value: `• Roles added: ${roleSyncResult.added}\n• Roles removed: ${roleSyncResult.removed}\n• Members checked: ${roleSyncResult.checked}`,
          inline: true
        },
        {
          name: '⏱️ Performance',
          value: `Duration: ${(duration / 1000).toFixed(2)}s`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString()
    };
    
    if (stats.errors.length > 0) {
      embed.fields.push({
        name: '⚠️ Errors',
        value: `\`\`\`${stats.errors.slice(0, 5).join('\n')}${stats.errors.length > 5 ? `\n... and ${stats.errors.length - 5} more` : ''}\`\`\``,
        inline: false
      });
      embed.color = 0xffaa00;
    }
    
    await interaction.editReply({ embeds: [embed] });
    
    logger.info(`✅ Database sync completed in ${(duration / 1000).toFixed(2)}s`);
    
  } catch (error) {
    logger.error({ err: error }, 'Error during database sync');
    await interaction.editReply({
      content: `❌ Database sync failed: ${error.message}`,
      flags: 64
    });
  }
};
