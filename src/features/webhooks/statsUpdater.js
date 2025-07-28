import fetch from 'node-fetch';

export const updateStatsWebhook = async (webhookUrl, stats = 'Server stats unavailable') => {
  await fetch(webhookUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `Server Stats: ${stats}` }),
  });
}; 