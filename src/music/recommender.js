import logger from '../utils/logger.js';

export class MusicRecommender {
  constructor(player) {
    this.player = player;
  }

  async getRecommendations(track, count = 1) {
    try {
      // Simple recommendation logic - search for similar tracks
      const searchQuery = this.buildSearchQuery(track);
      const results = await this.player.search(searchQuery, {
        requestedBy: track.requestedBy,
        searchEngine: 'youtube'
      });

      if (!results.hasTracks()) {
        logger.warn('No recommendations found for track:', track.title);
        return [];
      }

      // Filter out the current track and return recommendations
      const recommendations = results.tracks
        .filter(t => t.url !== track.url)
        .slice(0, count);

      logger.debug(`Generated ${recommendations.length} recommendations for: ${track.title}`);
      return recommendations;

    } catch (error) {
      logger.error({ err: error }, 'Error generating recommendations');
      return [];
    }
  }

  buildSearchQuery(track) {
    // Extract artist and title for better recommendations
    const title = track.title || '';
    const artist = track.author || '';
    
    // Try different search strategies
    if (artist && title) {
      return `${artist} ${title} similar music`;
    } else if (title) {
      return `${title} similar music`;
    } else {
      return 'music recommendations';
    }
  }

  async addRecommendationToQueue(guildId, track) {
    try {
      const node = this.player.nodes.get(guildId);
      if (!node) return false;

      const recommendations = await this.getRecommendations(track, 1);
      if (recommendations.length === 0) return false;

      const recommendation = recommendations[0];
      node.queue.addTrack(recommendation);
      
      logger.info(`Added recommendation to queue: ${recommendation.title}`);
      return true;

    } catch (error) {
      logger.error({ err: error }, 'Error adding recommendation to queue');
      return false;
    }
  }
}
