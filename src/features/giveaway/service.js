// src/features/giveaway/service.js
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
            for (const [, t] of this.activeTimers) { try { clearTimeout(t); } catch {} }
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
    try { return await fn(); } finally { this.inFlight.delete(giveawayId); }
  }

  getConfig() { if (!this.config) this.config = giveawayConfig(); return this.config; }
  parseDuration() { return null; }
  isBooster(member) { return Boolean(member.premiumSince); }

  calculateTickets(member) {
    const cfg = this.getConfig();
    let t = cfg.weights?.base ?? 1;
    if (this.isBooster(member)) t += (cfg.weights?.booster_bonus ?? 0);
    const cap = cfg.weights?.max_total ?? 2;
    return Math.min(t, cap);
  }

  async isEligible(member) {
    const cfg = this.getConfig();
    if (member.roles.cache.has(cfg.cns_member_role_id)) return true;
    const roleId = cfg.tag_eligibility.cns_tag_role_id;
    const minDays = cfg.tag_eligibility.min_role_age_days ?? 30;
    if (roleId && member.roles.cache.has(roleId)) {
      const first = getRoleFirstSeen(member.guild.id, member.id, roleId);
      if (!first) return false;
      const days = (Date.now() - first) / 86400000;
      return days >= minDays;
    }
    return false;
  }

  pickWeightedWinner(entries) {
    if (!entries?.length) return null;
    const pool = entries.filter(e => !e.withdrawn_at);
    if (!pool.length) return null;
    const totalTickets = pool.reduce((s, e) => s + e.tickets, 0);
    if (totalTickets <= 0) return null;
    let r = Math.random() * totalTickets;
    for (const e of pool) { r -= e.tickets; if (r <= 0) return e.user_id; }
    return pool[pool.length - 1].user_id;
  }

  generateEmbed(gv) {
    const colors = { open: 0x4ECDC4, closed: 0x45B7D1, drawn_unpublished: 0x96CEB4, published: 0xFFEAA7 };
    const title = gv.status === 'published' ? '🎉 Winner' : '🎁 Giveaway';
    const embed = new EmbedBuilder().setTitle(title).setColor(colors[gv.status] ?? 0x4ECDC4);

    const entries = countActiveEntries(gv.id);
    const endMs = gv.end_at < 1e12 ? gv.end_at * 1000 : gv.end_at;
    const endSec = Math.floor(endMs / 1000);

    if (gv.status === 'published') embed.setDescription(`**<@${gv.published_winner_user_id}>**\n${gv.description}`);
    else embed.setDescription(`@everyone\n${gv.description}`);

    const divider = '┈┈┈┈┈';
    const winner =
      gv.status === 'published' ? `Congrats: <@${gv.published_winner_user_id}>` :
      gv.status === 'drawn_unpublished' ? 'Pending Approval' : 't.b.d.';

    const statusText = gv.status === 'open' ? 'Open' : gv.status === 'closed' ? 'Closed' : null;
    const body = [
      `**Signups Close:** <t:${endSec}:f>  **Entries:** ${entries}`,
      ...(statusText ? [`**Status:** ${statusText}`] : []),
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
        attachments = [];
      }

      await message.edit({ embeds: [embed], components, files, attachments });
    } catch (error) {
      logger.error({ err: error }, 'failed to refresh giveaway message');
    }
  }

  async openSignups({ giveawayId, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv) throw new Error('not found');
    if (gv.status === 'open') {
      // ensure buttons visible when already open
      await this.refreshMessage(gv.channel_id, gv.message_id, gv, client);
      return;
    }
    if (gv.status !== 'closed') throw new Error('not closed');
    updateGiveaway(giveawayId, { status: 'open' });
    await this.refreshMessage(gv.channel_id, gv.message_id, { ...gv, status: 'open' }, client);
  }

  async closeSignups({ giveawayId, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv) throw new Error('not found');
    if (gv.status === 'closed') {
      // ensure buttons removed when already closed
      await this.refreshMessage(gv.channel_id, gv.message_id, gv, client);
      return;
    }
    if (gv.status !== 'open') throw new Error('not open');
    updateGiveaway(giveawayId, { status: 'closed' });
    await this.refreshMessage(gv.channel_id, gv.message_id, { ...gv, status: 'closed' }, client);
    this.clearTimer(giveawayId);
  }

  async draw({ giveawayId, client }) {
    return this._withLock(giveawayId, async () => {
      const gv = getGiveawayById(giveawayId);
      if (!gv) throw new Error('not found');
      if (gv.status === 'drawn_unpublished') return { pendingId: gv.pending_winner_user_id };
      if (gv.status === 'published') return { pendingId: gv.published_winner_user_id };
      if (gv.status !== 'closed') throw new Error('not closed');

      const entries = listActiveEntries(giveawayId);
      let eligibleEntries = entries;

      try {
        const guild = await client.guilds.fetch(gv.guild_id);
        const checks = entries.map(e => (async () => {
          try {
            const m = guild.members.cache.get(e.user_id) || await guild.members.fetch(e.user_id);
            return (await this.isEligible(m)) ? e : null;
          } catch { return null; }
        })());
        const results = await Promise.all(checks);
        eligibleEntries = results.filter(Boolean);
      } catch (err) {
        logger.warn({ err }, 'draw(): eligibility re-check skipped');
      }

      const pendingId = this.pickWeightedWinner(eligibleEntries);
      if (!pendingId) throw new Error('no valid entries');
      updateGiveaway(giveawayId, { status: 'drawn_unpublished', pendingWinnerUserId: pendingId });
      await this.refreshMessage(
        gv.channel_id,
        gv.message_id,
        { ...gv, status: 'drawn_unpublished', pending_winner_user_id: pendingId },
        client
      );
      return { pendingId };
    });
  }

  async publish({ giveawayId, client }) {
    return this._withLock(giveawayId, async () => {
      const gv = getGiveawayById(giveawayId);
      if (!gv) throw new Error('not found');
      if (gv.status === 'published') return;
      if (gv.status !== 'drawn_unpublished' || !gv.pending_winner_user_id) throw new Error('no pending winner');
      updateGiveaway(giveawayId, {
        status: 'published',
        publishedWinnerUserId: gv.pending_winner_user_id,
        pendingWinnerUserId: null
      });
      await this.refreshMessage(
        gv.channel_id,
        gv.message_id,
        { ...gv, status: 'published', published_winner_user_id: gv.pending_winner_user_id, pending_winner_user_id: null },
        client
      );
    });
  }

  generateButtons(giveawayId) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gw:join:${giveawayId}`).setLabel('Join').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`gw:leave:${giveawayId}`).setLabel('Withdraw').setStyle(ButtonStyle.Secondary)
    );
    return [row];
  }

  async createGiveaway({ guildId, channelId, description, imageAttachment, duration, createdBy, client }) {
    const existing = getOpenInChannel(channelId);
    if (existing) throw new Error('There is already an active giveaway in this channel. End it first.');

    const durationMs = parseDurationToMs(duration);
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('invalid duration. use like 10m, 2h, 1d');

    let endAt = Date.now() + durationMs;
    const endDate = new Date(endAt);
    endDate.setMinutes(0, 0, 0);
    if (endDate.getTime() < endAt) endDate.setHours(endDate.getHours() + 1);
    endAt = endDate.getTime();

    const giveawayId = `gw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    createGiveawayRow(giveawayId, guildId, channelId, null, description, null, endAt, createdBy);

    const channel = await client.channels.fetch(channelId);
    const file = imageAttachment ? { attachment: imageAttachment.url, name: imageAttachment.name } : null;
    const embed = this.generateEmbed({ id: giveawayId, status: 'open', end_at: endAt, description });
    if (file) embed.setImage(`attachment://${file.name}`);
    const buttons = this.generateButtons(giveawayId);

    const sent = await channel.send({ embeds: [embed], components: buttons, files: file ? [file] : [] });
    updateGiveaway(giveawayId, { messageId: sent.id });

    const imageUrl = sent.attachments.first()?.url ?? null;
    if (imageUrl) setGiveawayImageUrl(giveawayId, imageUrl);

    this.setEndTimer(giveawayId, endAt, client);
    return { giveawayId, message: sent };
  }

  async reroll({ giveawayId, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv || gv.status !== 'drawn_unpublished') throw new Error('reroll only when drawn and unpublished');
    const entries = listActiveEntries(giveawayId);
    const pendingId = this.pickWeightedWinner(entries);
    if (!pendingId) throw new Error('no valid entries');
    updateGiveaway(giveawayId, { status: 'drawn_unpublished', pendingWinnerUserId: pendingId });
    await this.refreshMessage(
      gv.channel_id, gv.message_id,
      { ...gv, status: 'drawn_unpublished', pending_winner_user_id: pendingId },
      client
    );
    return { pendingId };
  }

  async deleteGiveaway({ giveawayId, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv) throw new Error('Giveaway not found');
    try {
      const channel = await client.channels.fetch(gv.channel_id);
      const message = await channel.messages.fetch(gv.message_id);
      await message.delete();
    } catch (error) {
      logger.error({ err: error }, 'Failed to delete giveaway message');
    }
    deleteGiveawayRow(giveawayId);
    this.clearTimer(giveawayId);
    this.inFlight.delete(giveawayId);
    return true;
  }

  async addEntry({ giveawayId, userId, member, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv) throw new Error('Giveaway not found');
    if (gv.status !== 'open') throw new Error('Giveaway is not open for entries');
    if (!(await this.isEligible(member))) throw new Error('You are not eligible to join this giveaway');
    const tickets = this.calculateTickets(member);
    addEntry(giveawayId, userId, tickets);
    await this.refreshMessage(gv.channel_id, gv.message_id, gv, client);
    return { tickets };
  }

  async withdrawEntry({ giveawayId, userId, client }) {
    const gv = getGiveawayById(giveawayId);
    if (!gv) throw new Error('Giveaway not found');
    if (gv.status !== 'open') throw new Error('Cannot withdraw from ended giveaway');
    withdrawEntry(giveawayId, userId);
    await this.refreshMessage(gv.channel_id, gv.message_id, gv, client);
    return true;
  }

  getActiveGiveaway(channelId) { return getOpenInChannel(channelId); }

  setEndTimer(giveawayId, endAt, client) {
    const ms = endAt - Date.now();
    const doClose = async () => { try { await this.closeSignups({ giveawayId, client }); } catch {} };
    this.clearTimer(giveawayId);
    if (ms <= 0) { doClose(); return; }
    const timer = setTimeout(doClose, ms);
    this.activeTimers.set(giveawayId, timer);
  }

  clearTimer(giveawayId) {
    const t = this.activeTimers.get(giveawayId);
    if (t) { clearTimeout(t); this.activeTimers.delete(giveawayId); }
  }

  async restoreOpenGiveawaysOnStartup(client) {
    const toRestore = getToRestore();
    let restored = 0;
    for (const gv of toRestore) {
      const now = Date.now();
      if (gv.status !== 'open') continue;
      if (gv.end_at <= now) {
        try { await this.closeSignups({ giveawayId: gv.id, client }); } catch (e) {
          logger.error({ err: e }, `Failed to close overdue giveaway ${gv.id}`);
        }
      } else {
        if (!this.activeTimers.has(gv.id)) { this.setEndTimer(gv.id, gv.end_at, client); restored++; }
      }
    }
    logger.info(`Restored ${restored} open giveaways on startup`);
  }
}

/* named exports via interne singleton (handig voor jouw manager-knoppen) */
const svc = new GiveawayService();

export function refreshSignupsMessage(client, giveawayId) {
  const gv = getGiveawayById(giveawayId);
  if (!gv) return;
  return svc.refreshMessage(gv.channel_id, gv.message_id, gv, client);
}
export const openGiveaway = (client, giveawayId) => svc.openSignups({ giveawayId, client });
export const closeGiveaway = (client, giveawayId) => svc.closeSignups({ giveawayId, client });
export const drawWinner = (client, giveawayId) => svc.draw({ giveawayId, client });
export const publishWinner = (client, giveawayId) => svc.publish({ giveawayId, client });
export const rerollWinner = (client, giveawayId) => svc.reroll({ giveawayId, client });

export default GiveawayService;
