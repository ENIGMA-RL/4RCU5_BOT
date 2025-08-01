import { z } from 'zod';
import fs from 'fs';

const botConfigSchema = z.object({
  prefix: z.string(),
  ownerID: z.string(),
});

const rolesConfigSchema = z.object({
  adminRole: z.string(),
  modRole: z.string(),
  memberRole: z.string(),
});

const levelingConfigSchema = z.object({
  xpPerMessage: z.number(),
  xpPerMinuteVoice: z.number(),
  levelUpRoles: z.record(z.string(), z.string()),
});

const eventsConfigSchema = z.object({
  eventChannel: z.string(),
  teamSize: z.number(),
});

export const validateConfig = (filePath, schema) => {
  const configData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return schema.parse(configData);
};

// Example usage
try {
  validateConfig('./src/config/bot.json', botConfigSchema);
  validateConfig('./src/config/roles.json', rolesConfigSchema);
  validateConfig('./src/config/leveling.json', levelingConfigSchema);
  validateConfig('./src/config/events.json', eventsConfigSchema);
  console.log('All configurations are valid.');
} catch (error) {
  console.error('Configuration validation error:', error);
  process.exit(1);
} 