import { getCachedMessage, dropCachedMessage } from '../utils/messageCache.js';

export const name = 'messageDeleteBulk';
export const execute = async (messages) => {
  for (const m of messages.values()) {
    const cached = getCachedMessage(m.id);
    // You can add bulk deletion logging here if needed
    dropCachedMessage(m.id);
  }
}; 