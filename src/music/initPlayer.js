import { Player } from "discord-player";
import { YouTubeExtractor, SoundCloudExtractor, SpotifyExtractor } from "@discord-player/extractor";
import logger from '../utils/logger.js';

export default function initPlayer(client) {
  const player = new Player(client, {
    ytdlOptions: { 
      quality: "highestaudio", 
      highWaterMark: 1 << 25,
      filter: 'audioonly'
    },
    skipFFmpeg: false,
    useLegacyFFmpeg: false
  });

  // Register extractors
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
