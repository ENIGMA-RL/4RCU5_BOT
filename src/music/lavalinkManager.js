import { Client } from 'discord.js';
import { Manager } from 'lavalink-client';
import { channelsConfig, rolesConfig, loadConfig } from '../config/configLoader.js';
import logger from '../utils/logger.js';

/**
 * Lavalink Manager wrapper to mirror lavamusic-style control flow.
 */
export class LavalinkMusicManager {
  /**
   * @param {Client} client
   * @param {object} options
   */
  constructor(client, options) {
    this.client = client;
    this.options = options || {};

    const musicCfg = loadConfig('music');
    const nodes = (musicCfg.lavalink?.nodes || []).map(n => ({
      name: n.name || 'node',
      host: n.host,
      port: n.port,
      authorization: n.password,
      secure: Boolean(n.secure)
    }));

    this.manager = new Manager({
      nodes,
      sendToShard: (guildId, payload) => {
        const guild = this.client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      },
      autoSkip: true
    });

    this._wireClientVoice();
    this._wireEvents();
  }

  _wireClientVoice() {
    this.client.ws.on('VOICE_SERVER_UPDATE', (data) => this.manager.updateVoiceState(data));
    this.client.ws.on('VOICE_STATE_UPDATE', (data) => this.manager.updateVoiceState(data));
    this.client.on('raw', (d) => {
      if (d?.t?.startsWith('VOICE_')) this.manager.updateVoiceState(d.d);
    });
  }

  _wireEvents() {
    this.manager.on('ready', (node) => logger.info(`[Lavalink] Node ready: ${node.id}`));
    this.manager.on('error', (node, err) => logger.error({ err }, `[Lavalink] Node error: ${node.id}`));
    this.manager.on('disconnect', (node, reason) => logger.warn({ reason }, `[Lavalink] Node disconnected: ${node.id}`));
  }

  async connect() {
    try {
      await this.manager.init({
        clientId: this.client.user.id,
        shards: this.client.shard?.count || 1
      });
    } catch (err) {
      logger.error({ err }, '[Lavalink] init failed');
    }
  }

  /**
   * Get or create a player for a guild.
   */
  getOrCreatePlayer(guildId, voiceChannelId, textChannelId) {
    let player = this.manager.players.get(guildId);
    if (!player) {
      player = this.manager.createPlayer({
        guildId,
        voiceChannelId,
        textChannelId,
        selfDeaf: false,
        volume: this.options.defaultVolume ?? 80
      });
    }
    return player;
  }

  async joinAndPlay(guild, voiceChannel, textChannel, query, requestedBy) {
    logger.debug(`[lavalink] joinAndPlay guild=${guild?.id} vc=${voiceChannel?.id} query="${query}"`);
    const player = this.getOrCreatePlayer(guild.id, voiceChannel.id, textChannel.id);
    if (!player.connected) await player.connect();
    logger.debug(`[lavalink] player connected=${player.connected}`);

    const result = await this.manager.search(query, { requester: requestedBy, guildId: guild.id });
    logger.debug(`[lavalink] search type=${result?.type} tracks=${result?.tracks?.length || 0}`);
    if (!result || !result.tracks?.length) return { ok: false, reason: 'NO_MATCHES' };

    if (result.type === 'PLAYLIST') {
      player.queue.add(result.tracks, { requester: requestedBy });
      if (!player.playing && !player.paused) await player.play();
      return { ok: true, type: 'PLAYLIST', tracks: result.tracks };
    }

    player.queue.add(result.tracks[0], { requester: requestedBy });
    if (!player.playing && !player.paused) await player.play();
    return { ok: true, type: 'TRACK', track: result.tracks[0] };
  }
}

export default LavalinkMusicManager;

