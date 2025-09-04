import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { giveawayConfig } from '../../config/configLoader.js';
import db, {
  createGiveawayRow,
  getGiveawayById,
  getOpenInChannel,
  getToRestore,
  updateGiveaway,
  deleteGiveaway as deleteGiveawayRow,
  addEntry,
  withdrawEntry,
  listActiveEntries,
  countActiveEntries,
  getRoleFirstSeen
} from '../../database/db.js';

class GiveawayService {
  constructor() {
    this.config = null;
    this.activeTimers = new Map();
  }

  getConfig() {
    if (!this.config) {
      this.config = giveawayConfig();
    }
    return this.config;
  }

  // Parse duration strings like 10m, 2h, 1d into milliseconds
  parseDuration(durationStr) {
    const match = durationStr.match(/^(\d+)([mhd])$/);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    let multiplier;
    switch (unit) {
      case 'm': multiplier = 60 * 1000; break; // minutes in ms
      case 'h': multiplier = 60 * 60 * 1000; break; // hours in ms
      case 'd': multiplier = 24 * 60 * 60 * 1000; break; // days in ms
      default: return null;
    }
    
    return value * multiplier;
  }

  // Check if user is a server booster
  isBooster(member) {
    return Boolean(member.premiumSince);
  }

  // Calculate user's ticket count
  calculateTickets(member) {
    const cfg = this.getConfig();
    let t = cfg.weights?.base ?? 1;

    // booster bonus only
    if (this.isBooster(member)) t += (cfg.weights?.booster_bonus ?? 0);

    const cap = cfg.weights?.max_total ?? 2;
    return Math.min(t, cap);
  }

  // Check if user is eligible to join
  async isEligible(member) {
    const cfg = this.getConfig();
    // member role
    if (member.roles.cache.has(cfg.cns_member_role_id)) return true;

    // tag with tenure
    const roleId = cfg.tag_eligibility.cns_tag_role_id;
    const minDays = cfg.tag_eligibility.min_role_age_days ?? 30;
    if (roleId && member.roles.cache.has(roleId)) {
      const first = getRoleFirstSeen(member.guild.id, member.id, roleId);
      if (!first) return false; // not tracked yet
      const days = (Date.now() - first) / 86400000;
      return days >= minDays;
    }
    return false;
  }

  // Pick weighted winner from entries
  pickWeightedWinner(entries) {
    if (!entries || entries.length === 0) {
      return null;
    }
    
    // Filter out withdrawn entries
    const pool = entries.filter(e => !e.withdrawn_at);
    
    if (pool.length === 0) {
      return null;
    }
    
    // Calculate total tickets
    const totalTickets = pool.reduce((sum, entry) => sum + entry.tickets, 0);
    
    if (totalTickets <= 0) {
      return null;
    }
    
    // Pick random winner based on ticket weight
    let random = Math.random() * totalTickets;
    
    for (const entry of pool) {
      random -= entry.tickets;
      if (random <= 0) {
        return entry.user_id;
      }
    }
    
    // Fallback to last entry
    return pool[pool.length - 1].user_id;
  }

  // Generate giveaway embed
  generateEmbed(gv) {
    const colors = { open: 0x4ECDC4, closed: 0x45B7D1, drawn_unpublished: 0x96CEB4, published: 0xFFEAA7 };
    const title = gv.status === 'published' ? '🎉 winner' : '🎁 Giveaway';
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        gv.status === 'published'
          ? `\n**<@${gv.published_winner_user_id}>**\n\n${gv.description}\n`
          : `@everyone\n\n${gv.description}\n`
      )
      .setColor(colors[gv.status] ?? 0x4ECDC4);

    const entries = countActiveEntries(gv.id);
    
    // Safe guard: if end_at < 10^12 treat as seconds and convert to ms inline
    let endAt = gv.end_at;
    if (endAt < 10**12) {
      endAt = endAt * 1000; // Convert seconds to milliseconds
    }
    const endSec = Math.floor(endAt / 1000);

    const eligibility = ['• CNS Member+ (lvl 3 and above)', '• Or CNS tag equiped for at least 30 days'].join('\n');
    const oddsNote = 'Server boosters get +1 ticket (2× chance vs non-boosters)';
    
    // Add compact fields with light spacing between sections
    embed.addFields(
      { name: 'Signups Close', value: gv.status === 'open' ? `<t:${endSec}:f>` : 'closed', inline: true },
      { name: 'Entries', value: `${entries}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: 'Eligibility', value: eligibility, inline: false },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: 'Increase your chances', value: oddsNote, inline: false },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: 'Winner', value: 
        gv.status === 'published' ? `Congrats: <@${gv.published_winner_user_id}>!` 
        : gv.status === 'drawn_unpublished' ? 'pending approval' 
        : 'tbd', 
        inline: false 
      }
    );

    // Note: Image is handled in refreshMessage to preserve attachment positioning
    embed.setFooter({ text: 'press join to enter, withdraw to leave' });
    return embed;
  }

  // Refresh message helper - BULLETPROOF IMAGE HANDLING
  async refreshMessage(channelId, messageId, giveaway, client) {
    try {
      const channel = await client.channels.fetch(channelId);
      const message = await channel.messages.fetch(messageId);

      const embed = this.generateEmbed(giveaway);
      const components = giveaway.status === 'open' ? this.generateButtons(giveaway.id) : [];

      const imageUrl =
        giveaway.image_url ||
        message.embeds?.[0]?.image?.url ||
        message.attachments.first()?.url ||
        null;

      let files = [];
      let attachments;
      if (imageUrl) {
        const name = 'giveaway.png';
        embed.setImage(`attachment://${name}`);
        files = [{ attachment: imageUrl, name }];
        attachments = []; // drop old attachment so it does not render above the embed
      }

      await message.edit({
        embeds: [embed],
        components,
        files,
        attachments
      });
    } catch (error) {
      console.error('failed to refresh giveaway message:', error);
    }
  }

  // closed -> open (reopen signups)
  async openSignups({ giveawayId, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv || gv.status !== 'closed') throw new Error('not closed');
    updateGiveaway(giveawayId, { status: 'open' });
    await this.refreshMessage(gv.channel_id, gv.message_id, { ...gv, status: 'open' }, client);
  }

  // open -> closed
  async closeSignups({ giveawayId, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv || gv.status !== 'open') throw new Error('not open');
    updateGiveaway(giveawayId, { status: 'closed' });
    await this.refreshMessage(gv.channel_id, gv.message_id, { ...gv, status: 'closed' }, client);
  }

  // closed -> drawn_unpublished
  async draw({ giveawayId, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv || gv.status !== 'closed') throw new Error('not closed');
    const entries = listActiveEntries(giveawayId);
    const pendingId = this.pickWeightedWinner(entries);
    if (!pendingId) throw new Error('no valid entries');
    updateGiveaway(giveawayId, { status: 'drawn_unpublished', pendingWinnerUserId: pendingId });
    await this.refreshMessage(gv.channel_id, gv.message_id, { ...gv, status: 'drawn_unpublished', pending_winner_user_id: pendingId }, client);
    return { pendingId };
  }

  // drawn_unpublished -> published
  async publish({ giveawayId, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv || gv.status !== 'drawn_unpublished' || !gv.pending_winner_user_id) throw new Error('no pending winner');
    updateGiveaway(giveawayId, { status: 'published', publishedWinnerUserId: gv.pending_winner_user_id, pendingWinnerUserId: null });
    await this.refreshMessage(gv.channel_id, gv.message_id, { ...gv, status: 'published', published_winner_user_id: gv.pending_winner_user_id, pending_winner_user_id: null }, client);
  }

  // Generate join/withdraw buttons
  generateButtons(giveawayId) {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`gw:join:${giveawayId}`)
          .setLabel('Join')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`gw:leave:${giveawayId}`)
          .setLabel('Withdraw')
          .setStyle(ButtonStyle.Secondary)
      );
    
    return [row];
  }

  // Create a new giveaway
  async createGiveaway({ guildId, channelId, description, imageAttachment, duration, createdBy, client }) {
    // Check if there's already an active giveaway in this channel
    const existing = getOpenInChannel(channelId);
    if (existing) {
      throw new Error('There is already an active giveaway in this channel. End it first.');
    }
    
    // Parse duration
    const durationMs = this.parseDuration(duration);
    if (!durationMs) {
      throw new Error('Invalid duration format. Use format like "10m", "2h", "1d"');
    }
    
    // Calculate end time
    const endAt = Date.now() + durationMs;
    const giveawayId = `gw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create database row (initially without image_url)
    createGiveawayRow(giveawayId, guildId, channelId, '', description, null, endAt, createdBy);
    
    // Get channel and post embed
    const channel = await client.channels.fetch(channelId);
    const file = imageAttachment ? { attachment: imageAttachment.url, name: imageAttachment.name } : null;
    const embed = this.generateEmbed({ id: giveawayId, status: 'open', end_at: endAt, description });
    if (file) embed.setImage(`attachment://${file.name}`);
    const buttons = this.generateButtons(giveawayId);
    
    const sent = await channel.send({
      embeds: [embed],
      components: buttons,
      files: file ? [file] : []
    });
    
    // Update message ID in database
    updateGiveaway(giveawayId, { messageId: sent.id });
    
    // If there was an attachment, capture its URL back into the row
    const imageUrl = sent.attachments.first()?.url ?? null;
    if (imageUrl) {
      db.prepare(`UPDATE giveaways SET image_url = ? WHERE id = ?`).run(imageUrl, giveawayId);
    }
    
    // Set timer to end giveaway
    this.setEndTimer(giveawayId, endAt, client);
    
    return { giveawayId, message: sent };
  }

  // Reroll winner
  async reroll({ giveawayId, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv || gv.status !== 'drawn_unpublished') throw new Error('reroll only when drawn and unpublished');
    const entries = listActiveEntries(giveawayId);
    const pendingId = this.pickWeightedWinner(entries);
    if (!pendingId) throw new Error('no valid entries');
    updateGiveaway(giveawayId, { status: 'drawn_unpublished', pendingWinnerUserId: pendingId });
    await this.refreshMessage(gv.channel_id, gv.message_id, { ...gv, status: 'drawn_unpublished', pending_winner_user_id: pendingId }, client);
    return { pendingId };
  }

  // Delete a giveaway
  async deleteGiveaway({ giveawayId, client }) {
    const giveaway = getGiveawayById(giveawayId);
    if (!giveaway) {
      throw new Error('Giveaway not found');
    }
    
    // Try to delete the message
    try {
      const channel = await client.channels.fetch(giveaway.channel_id);
      const message = await channel.messages.fetch(giveaway.message_id);
      await message.delete();
    } catch (error) {
      console.error('Failed to delete giveaway message:', error);
    }
    
    // Delete from database
    deleteGiveawayRow(giveawayId);
    
    // Clear timer
    this.clearTimer(giveawayId);
    
    return true;
  }

  // Add entry to giveaway
  async addEntry({ giveawayId, userId, member, client }) {
    const giveaway = getGiveawayById(giveawayId);
    if (!giveaway) throw new Error('Giveaway not found');
    if (giveaway.status !== 'open') throw new Error('Giveaway is not open for entries');
    if (!await this.isEligible(member)) throw new Error('You are not eligible to join this giveaway');

    const tickets = this.calculateTickets(member);
    addEntry(giveawayId, userId, tickets);

    await this.refreshMessage(giveaway.channel_id, giveaway.message_id, giveaway, client);
    return { tickets };
  }

  // Withdraw entry from giveaway
  async withdrawEntry({ giveawayId, userId, client }) {
    const giveaway = getGiveawayById(giveawayId);
    if (!giveaway) throw new Error('Giveaway not found');
    if (giveaway.status !== 'open') throw new Error('Cannot withdraw from ended giveaway');

    withdrawEntry(giveawayId, userId);

    await this.refreshMessage(giveaway.channel_id, giveaway.message_id, giveaway, client);
    return true;
  }

  // Get active giveaway in channel
  getActiveGiveaway(channelId) {
    return getOpenInChannel(channelId);
  }

  // Set timer to end giveaway
  setEndTimer(giveawayId, endAt, client) {
    const ms = endAt - Date.now();
    const doClose = async () => {
      try { await this.closeSignups({ giveawayId, client }); } catch (e) { console.error(e); }
    };
    if (ms <= 0) { doClose(); return; }
    const timer = setTimeout(doClose, ms);
    this.activeTimers.set(giveawayId, timer);
  }

  // Clear timer for giveaway
  clearTimer(giveawayId) {
    const timer = this.activeTimers.get(giveawayId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(giveawayId);
    }
  }

  // Restore open giveaways on startup
  async restoreOpenGiveawaysOnStartup(client) {
    const toRestore = getToRestore();
    let restoredCount = 0;
    
    for (const giveaway of toRestore) {
      const now = Date.now();
      
      if (giveaway.status !== 'open') continue;
      
      if (giveaway.end_at <= now) {
        // Past due, close immediately
        try {
          await this.closeSignups({ giveawayId: giveaway.id, client });
        } catch (error) {
          console.error(`Failed to close overdue giveaway ${giveaway.id}:`, error);
        }
      } else {
        // Still active, set timer
        this.setEndTimer(giveaway.id, giveaway.end_at, client);
        restoredCount++;
      }
    }
    
    console.log(`✅ Restored ${restoredCount} open giveaways on startup`);
  }
}

export default GiveawayService;
