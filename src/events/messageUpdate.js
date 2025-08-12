import { cacheMessage } from '../utils/messageCache.js';

export const name = 'messageUpdate';
export const execute = async (_oldMessage, newMessage) => {
  if (newMessage.author?.bot) return;
  cacheMessage(newMessage);
}; 