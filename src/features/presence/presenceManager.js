// src/features/presence/presenceManager.js
import { botConfig } from '../../config/configLoader.js';
import logger from '../../utils/logger.js';

let rotationTimer = null;

function applyPresence(client, cfg, activity) {
  if (!client?.user) {
    logger.warn('Cannot set presence: client.user is not available');
    return;
  }
  client.user.setPresence({
    activities: [{ name: activity.name, type: activity.type }],
    status: cfg?.presence?.status || 'online',
  });
}

function setPresence(client) {
  try {
    const cfg = botConfig();
    const activities = Array.isArray(cfg?.presence?.activities) ? cfg.presence.activities : [];

    if (rotationTimer) { clearTimeout(rotationTimer); rotationTimer = null; }

    // no rotation, just set first or default
    if (!cfg?.presence?.rotate || activities.length === 0) {
      const one = activities[0] || { name: cfg?.presence?.default || 'VAIIYA', type: 3 };
      applyPresence(client, cfg, one);
      logger.info('✅ Presence set');
      return;
    }

    // cycle rotation with per-activity durations
    let i = 0;
    const tick = () => {
      const act = activities[i] || activities[0];
      logger.debug({ index: i, activity: act, wait: Number(act.duration_ms || cfg?.presence?.rotate_ms || 30000) }, 'Rotating presence');
      applyPresence(client, cfg, act);

      const wait = Number(act.duration_ms || cfg?.presence?.rotate_ms || 30000);
      i = (i + 1) % activities.length;
      rotationTimer = setTimeout(tick, wait);
    };

    tick();
    logger.info('✅ Presence rotation started');
  } catch (e) {
    logger.error({ err: e }, 'Failed to set presence');
  }
}

export { setPresence };