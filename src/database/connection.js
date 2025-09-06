import betterSqlite3 from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDatabasePath() {
  try {
    const env = process.env.NODE_ENV || 'development';
    const cfgDir = path.join(__dirname, '..', 'config', env === 'development' ? 'test' : '');
    const botJson = path.join(cfgDir, 'bot.json');
    if (fs.existsSync(botJson)) {
      const cfg = JSON.parse(fs.readFileSync(botJson, 'utf8'));
      const configured = cfg.database_path;
      if (configured) {
        return path.isAbsolute(configured) ? configured : path.join(__dirname, configured);
      }
    }
  } catch {}
  return path.join(__dirname, 'bot.db');
}

const dbPath = resolveDatabasePath();
const db = new betterSqlite3(dbPath);
db.pragma('foreign_keys = ON');

export function getDb() {
  return db;
}

export function closeDb() {
  try { db.close(); } catch {}
}

export default db;


