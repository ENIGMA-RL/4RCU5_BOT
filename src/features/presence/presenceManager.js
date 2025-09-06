// src/features/presence/presenceManager.js
import { botConfig } from '../../config/configLoader.js';
import logger from '../../utils/logger.js';

let rotationTimer = null;

function pickActivity(cfg) {
  const activities = cfg?.presence?.activities;
  if (Array.isArray(activities) && activities.length > 0) {
    return activities[Math.floor(Math.random() * activities.length)];
  }
  // Default to original behavior: Listening to VAIIYA
  return { name: cfg?.presence?.default || 'VAIIYA', type: 3 };
}

function setPresence(client) {
  try {
    const cfg = botConfig();
    const activity = pickActivity(cfg);
    client.user.setPresence({
      activities: [activity],
      status: cfg?.presence?.status || 'online',
    });
    logger.info('✅ Presence set');
    // optional rotation
    const shouldRotate = Boolean(cfg?.presence?.rotate);
    const rotateMs = Number(cfg?.presence?.rotate_ms || 0);
    if (rotationTimer) { clearInterval(rotationTimer); rotationTimer = null; }
    if (shouldRotate && rotateMs > 0 && Array.isArray(cfg?.presence?.activities) && cfg.presence.activities.length > 1) {
      rotationTimer = setInterval(() => {
        const next = pickActivity(cfg);
        client.user.setPresence({ activities: [next], status: cfg?.presence?.status || 'online' });
      }, rotateMs);
    }
  } catch (e) {
    logger.error({ err: e }, 'Failed to set presence');
  }
}

export { setPresence };