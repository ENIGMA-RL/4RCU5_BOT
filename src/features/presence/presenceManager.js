// src/features/presence/presenceManager.js

function setPresence(client) {
  client.user.setPresence({
    activities: [{ name: 'VAIIYA', type: 3 }],
    status: 'online',
  });
  console.log('✅ Presence set');
}

export { setPresence }; 