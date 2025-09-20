import { Player } from "discord-player";
import Extractors from "@discord-player/extractor";
import logger from '../utils/logger.js';
import { musicConfig } from '../config/configLoader.js';

export default async function initPlayer(client) {
  const cfg = musicConfig();
  if (cfg.mode === 'lavalink') {
    try {
      // Lazy import so the bot still runs if dependency is missing
      const module = await import('./lavalinkManager.js');
      const LavalinkMusicManager = module.default;
      const lavalink = new LavalinkMusicManager(client, { defaultVolume: cfg.lavalink?.defaultVolume || 80 });
      client.once('ready', () => lavalink.connect());
      logger.info('Initialized Lavalink music manager');
      return lavalink;
    } catch (err) {
      logger.warn({ err }, 'Lavalink not available, falling back to discord-player');
    }
  }

  const player = new Player(client, {
    ytdlOptions: { 
      quality: "highestaudio", 
      highWaterMark: 1 << 25,
      filter: 'audioonly'
    },
    skipFFmpeg: false,
    useLegacyFFmpeg: false
  });

  // Register extractors (CJS default export destructure)
  const { YouTubeExtractor, SoundCloudExtractor, SpotifyExtractor } = Extractors;
  player.extractors.register(YouTubeExtractor, {});
  player.extractors.register(SoundCloudExtractor, {});
  player.extractors.register(SpotifyExtractor, { 
    parallel: true, 
    emitEventsAfterFetching: true 
  });

  // Configure player behavior
  player.events.setMaxListeners(20);

  logger.info('Music player initialized with YouTube, SoundCloud, and Spotify extractors');
  
  return player;
}
