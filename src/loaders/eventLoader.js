import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const loadEvents = async (client) => {
  // Optionally keep these logs if you want to track event loading
  // console.log('📂 Loading events...');
  const eventFiles = fs.readdirSync(path.join(__dirname, '../events')).filter(file => file.endsWith('.js'));
  // console.log(`📁 Found ${eventFiles.length} event files: ${eventFiles.join(', ')}`);
  
  for (const file of eventFiles) {
    // console.log(`🔄 Loading event: ${file}`);
    const event = await import(`../events/${file}`);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
      // console.log(`✅ Loaded once event: ${event.name}`);
    } else {
      client.on(event.name, (...args) => event.execute(...args));
      // console.log(`✅ Loaded event: ${event.name}`);
    }
  }
  // console.log('🎉 Events loaded successfully!');
};

export default loadEvents; 