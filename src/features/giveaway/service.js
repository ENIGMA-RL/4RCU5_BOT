import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { giveawayConfig } from '../../config/configLoader.js';
import db from '../../database/connection.js';
import { getRoleFirstSeen } from '../../repositories/tagRepo.js';
import {
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
  setGiveawayImageUrl
} from '../../repositories/giveawaysRepo.js';
import logger from '../../utils/logger.js';

// Parse duration strings like "10m", "2h", "1d" (also supports s)
function parseDurationToMs(input) {
  if (!input) return NaN;
  const m = String(input).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!m) return NaN;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = unit === 's' ? 1e3 : unit === 'm' ? 60e3 : unit === 'h' ? 3600e3 : 86400e3;
  return n * mult;
}

class GiveawayService {
  constructor() {
    this.config = null;
    this.activeTimers = new Map();
    this.inFlight = new Set();
    if (!GiveawayService._shutdownHookRegistered) {
      try {
        const clearAll = () => {
          try {
            for (const [, t] of this.activeTimers) {
              try { clearTimeout(t); } catch {}
            }
            this.activeTimers.clear();
          } catch {}
        };
        process.once('SIGINT', clearAll);
        process.once('SIGTERM', clearAll);
      } catch {}
      GiveawayService._shutdownHookRegistered = true;
    }
  }

  async _withLock(giveawayId, fn) {
    if (this.inFlight.has(giveawayId)) return;
    this.inFlight.add(giveawayId);
    try {
      return await fn();
    } finally {
      this.inFlight.delete(giveawayId);
    }
  }

  getConfig() {
    if (!this.config) {
      this.config = giveawayConfig();
    }
    return this.config;
  }

  // parseDuration is deprecated; use parseDurationToMs
  parseDuration() { return null; }

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

  // Generate giveaway embed (compact with thin dividers)
  generateEmbed(gv) {
    const colors = { open: 0x4ECDC4, closed: 0x45B7D1, drawn_unpublished: 0x96CEB4, published: 0xFFEAA7 };
    const title = gv.status === 'published' ? '🎉 Winner' : '🎁 Giveaway';
    const embed = new EmbedBuilder().setTitle(title).setColor(colors[gv.status] ?? 0x4ECDC4);

    const entries = countActiveEntries(gv.id);
    let endAt = gv.end_at < 1e12 ? gv.end_at * 1000 : gv.end_at;
    const endSec = Math.floor(endAt / 1000);

    if (gv.status === 'published') {
      embed.setDescription(`**<@${gv.published_winner_user_id}>**\n${gv.description}`);
    } else {
      embed.setDescription(`@everyone\n${gv.description}`);
    }

    const divider = '┈┈┈┈┈';
    const winner = gv.status === 'published' ? `Congrats: <@${gv.published_winner_user_id}>`
      : gv.status === 'drawn_unpublished' ? 'Pending Approval'
      : 't.b.d.';

    const body = [
      `**Signups Close:** <t:${endSec}:f>  **Entries:** ${entries}`,
      divider,
      '**Eligibility:**',
      '• CNS Member+ (Lvl 3+)',
      '• Or CNS Tag Equipped ≥ 30 Days',
      divider,
      '**Increase Your Chances:**',
      'Server Boosters Get +1 Ticket',
      divider,
      `**Winner:** ${winner}`
    ].join('\n');

    embed.addFields({ name: '\u200a', value: body, inline: false });
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
      logger.error({ err: error }, 'failed to refresh giveaway message');
    }
  }

  // closed -> open (reopen signups)
  async openSignups({ giveawayId, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv) throw new Error('not found');
    if (gv.status === 'open') return; // idempotent
    if (gv.status !== 'closed') throw new Error('not closed');
    updateGiveaway(giveawayId, { status: 'open' });
    await this.refreshMessage(gv.channel_id, gv.message_id, { ...gv, status: 'open' }, client);
  }

  // open -> closed
  async closeSignups({ giveawayId, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv) throw new Error('not found');
    if (gv.status === 'closed') return; // idempotent
    if (gv.status !== 'open') throw new Error('not open');
    updateGiveaway(giveawayId, { status: 'closed' });
    await this.refreshMessage(gv.channel_id, gv.message_id, { ...gv, status: 'closed' }, client);
    this.clearTimer(giveawayId);
  }

  // closed -> drawn_unpublished
  async draw({ giveawayId, client }) {
    return this._withLock(giveawayId, async () => {
      const gv = getGiveawayById(giveawayId);
      if (!gv) throw new Error('not found');
      if (gv.status === 'drawn_unpublished') return { pendingId: gv.pending_winner_user_id };
      if (gv.status === 'published') return { pendingId: gv.published_winner_user_id };
      if (gv.status !== 'closed') throw new Error('not closed');
    const entries = listActiveEntries(giveawayId);

    // Re-check eligibility at draw time to ensure fairness
    let eligibleEntries = entries;
    try {
      const guild = await client.guilds.fetch(gv.guild_id);
      const checks = [];
      for (const e of entries) {
        checks.push((async () => {
          try {
            const member = guild.members.cache.get(e.user_id) || await guild.members.fetch(e.user_id);
            const ok = await this.isEligible(member);
            return ok ? e : null;
          } catch {
            return null;
          }
        })());
      }
      const results = await Promise.all(checks);
      eligibleEntries = results.filter(Boolean);
    } catch (err) {
      logger.warn({ err }, 'draw(): eligibility re-check skipped due to error');
    }

      const pendingId = this.pickWeightedWinner(eligibleEntries);
      if (!pendingId) throw new Error('no valid entries');
      updateGiveaway(giveawayId, { status: 'drawn_unpublished', pendingWinnerUserId: pendingId });
      await this.refreshMessage(gv.channel_id, gv.message_id, { ...gv, status: 'drawn_unpublished', pending_winner_user_id: pendingId }, client);
      return { pendingId };
    });
  }

  // drawn_unpublished -> published
  async publish({ giveawayId, client }) {
    return this._withLock(giveawayId, async () => {
      const gv = getGiveawayById(giveawayId);
      if (!gv) throw new Error('not found');
      if (gv.status === 'published') return;
      if (gv.status !== 'drawn_unpublished' || !gv.pending_winner_user_id) throw new Error('no pending winner');
      updateGiveaway(giveawayId, { status: 'published', publishedWinnerUserId: gv.pending_winner_user_id, pendingWinnerUserId: null });
      await this.refreshMessage(gv.channel_id, gv.message_id, { ...gv, status: 'published', published_winner_user_id: gv.pending_winner_user_id, pending_winner_user_id: null }, client);
    });
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
    
    // Parse duration safely
    const durationMs = parseDurationToMs(duration);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('invalid duration. use like 10m, 2h, 1d');
    }
    // Calculate end time (round up to next hour for consistency)
    let endAt = Date.now() + durationMs;
    const endDate = new Date(endAt);
    endDate.setMinutes(0, 0, 0);
    if (endDate.getTime() < endAt) {
      endDate.setHours(endDate.getHours() + 1);
    }
    endAt = endDate.getTime();
    const giveawayId = `gw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create database row (initially without image_url)
    createGiveawayRow(giveawayId, guildId, channelId, null, description, null, endAt, createdBy);
    
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
      setGiveawayImageUrl(giveawayId, imageUrl);
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
      logger.error({ err: error }, 'Failed to delete giveaway message');
    }
    
    // Delete from database
    deleteGiveawayRow(giveawayId);
    
    // Clear timer
    this.clearTimer(giveawayId);
    this.inFlight.delete(giveawayId);
    
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
      try { await this.closeSignups({ giveawayId, client }); } catch (e) { /* ignore */ }
    };
    // Always clear any existing timer first
    this.clearTimer(giveawayId);
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
          logger.error({ err: error }, `Failed to close overdue giveaway ${giveaway.id}`);
        }
      } else {
        // Still active, set timer
        if (!this.activeTimers.has(giveaway.id)) {
          this.setEndTimer(giveaway.id, giveaway.end_at, client);
          restoredCount++;
        }
      }
    }
    
    logger.info(`Restored ${restoredCount} open giveaways on startup`);
  }
}

export default GiveawayService;
