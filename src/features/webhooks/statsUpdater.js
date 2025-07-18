import fetch from 'node-fetch';
import { getGuildStats } from '../utils/statsUtil.js';

export const updateStatsWebhook = async (webhookUrl) => {
  const stats = getGuildStats();
  await fetch(webhookUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `Server Stats: ${stats}` }),
  });
}; 