# 🤖 4RCU5 — The CNS Discord Bot

4RCU5 is a custom-built Discord bot for the CNS server, crafted for our lore-rich hacker community. Built with Node.js and Discord.js, the bot supports slash commands, real-time updates, and more.

> 🧠 Born from corrupted SYS$HORIZON protocols and stabilized with rogue VAIIYA code, 4RCU5 watches the cracks in the network...

---

## ⚙️ Features

* ✅ **Slash Commands** — Clean `/say` messaging system with role-based access
* 📊 **Server Stats Tracker** — Updates a stats embed with member count, boost count, and CNS tag usage
* 🧬 **Tag Intelligence** — Fetches real-time `identity_enabled` data for server tag tracking
* 👮 **Automod** — Blocks messages containing Discord invite links and notifies the user in private
* 👻 **Ghost Mode** — Replies with ephemeral confirmations, keeping command use clean
* 🎮 **Leveling System** — XP and level tracking with role assignments
* 🎤 **Voice Channel Management** — Dynamic voice channels with limits and permissions
* 🛡️ **Moderation Tools** — Ban, kick, timeout, and purge commands
* 📈 **Staff Management** — Automatic staff embed updates and role synchronization
* 🧩 **Ready for Expansion** — Modular command support for future CNS utilities and lore events

---

## 📦 Tech Stack

* Discord.js v14
* Node.js 18+
* `dotenv` for environment configuration
* `better-sqlite3` for database management
* `node-fetch` for Discord API requests

---

## 🚀 Getting Started

### **Prerequisites**
- Node.js 18+ installed
- Discord Bot Token
- Discord Application with proper permissions

### **Installation**

1. **Clone the repository**
   ```bash
   git clone https://github.com/ENIGMA-RL/4RCU5_BOT.git
   cd 4RCU5_BOT
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file in the root directory (this file is gitignored):
   ```env
   DISCORD_TOKEN=your_bot_token_here
   DISCORD_CLIENT_ID=your_client_id_here
   # Add any other required environment variables here
   ```
   > **Note:** Never commit your `.env` file. It is ignored by git for security.

4. **Configure bot settings**
   - Update files in `src/config/` (such as `roles.json`, `channels.json`, `levelSettings.json`) with your server-specific IDs and preferences.
   - For local/test configurations, you may use a `config.test/` folder. This folder is gitignored and can be used for local overrides or test configs.

5. **Start the bot**
   ```bash
   npm run start
   ```

### **Required Bot Permissions**
- `GUILD_MEMBERS` — Member management and role assignment
- `MANAGE_ROLES` — Role assignment and management
- `MANAGE_CHANNELS` — Voice channel management
- `SEND_MESSAGES` — Command responses
- `EMBED_LINKS` — Rich embeds
- `ATTACH_FILES` — File uploads
- `USE_EXTERNAL_EMOJIS` — Custom emojis
- `MANAGE_MESSAGES` — Moderation commands

---

## 🔒 Environment & Configuration

### **Production Environment**
- **.env**: Store production secrets and environment-specific variables here. This file is ignored by git.
- **src/config/**: Store production configuration files (IDs, settings, etc.).

### **Development Environment**
- **.env.dev**: Store development environment variables (gitignored)
- **src/config.test/**: Development configuration files with test server IDs and settings
- **NODE_ENV=development**: Automatically loads config.test/ files when set

### **Environment Setup**
```bash
# For development
cp env.example .env.dev
# Edit .env.dev with your development bot credentials

# For production
cp env.example .env
# Edit .env with your production bot credentials
```

### **Running Different Environments**
```bash
# Local Development (uses config.test/ and .env.dev)
npm run dev
npm run start:dev

# Production (uses src/config/ and .env)
npm run start
```

### **Local Development Setup**
1. Create your development bot in Discord Developer Portal
2. Create a test Discord server
3. Copy `env.example` to `.env.dev` and fill in your development bot credentials
4. Update `src/config.test/` files with your test server IDs
5. Run `setup-dev.bat` (Windows) or `./setup-dev.sh` (Linux/Mac)
6. Start development bot with `npm run dev`

---

## 🔧 Configuration

### **Role Configuration** (`src/config/roles.json`)
- Admin, mod, and member role IDs
- Level role assignments
- Tag guild and official role IDs
- Command permissions

### **Channel Configuration** (`src/config/channels.json`)
- Welcome, stats, staff, and log channels
- Rules and level check channels

### **Level Settings** (`src/config/levelSettings.json`)
- XP thresholds and role assignments
- Persistent role settings
- Level-up role mappings

---

## 📊 Features in Detail

### **Tag Role Synchronization**
The bot automatically syncs CNS Official roles based on users' server tag status:

- **Real-time Sync**: Monitors `guildMemberUpdate` events for instant role updates
- **Periodic Sync**: Runs every 5 minutes to ensure all users are properly synced
- **Manual Sync**: `/tag-sync` command for developers to manually trigger syncs
- **Bot Token Approach**: Uses Discord API with bot token to check `primary_guild.identity_enabled`

### **Leveling System**
Comprehensive XP and leveling system with voice channel support:

- **Message XP**: Users gain XP for sending messages
- **Voice XP**: Users gain XP for being in voice channels
- **Role Assignments**: Automatic role assignment based on level thresholds
- **Leaderboards**: `/leaderboard` command to view top users
- **Rank Cards**: `/rank` command with custom background support

### **Voice Channel Management**
Dynamic voice channel system with advanced features:

- **Auto-creation**: Temporary voice channels created on demand
- **Permission Control**: `/lock`, `/unlock`, `/limit` commands
- **Channel Transfer**: `/transfer` command to give ownership
- **Renaming**: `/rename` command for custom channel names

### **Moderation Tools**
Comprehensive moderation system with logging:

- **Ban/Unban**: `/ban` and `/unban` commands
- **Kick**: `/kick` command for temporary removal
- **Timeout**: `/timeout` command for temporary mutes
- **Purge**: `/purge` command to delete multiple messages
- **Logging**: All moderation actions logged to designated channel

### **Staff Management**
Automatic staff embed updates and role synchronization:

- **Staff Embed**: Automatically updates when staff roles change
- **Rules Embed**: Dynamic rules display with role-based visibility
- **Role Sync**: Automatic synchronization of staff roles across the server

---

## 🎮 Commands

### **General Commands**
- `/help` — Display available commands
- `/info` — Show bot information
- `/ping` — Check bot latency
- `/say` — Send a message as the bot (moderator only)

### **Leveling Commands**
- `/levels` — Show leveling information
- `/leaderboard` — Display top users by XP
- `/rank` — Show user's rank card
- `/setbackground` — Set custom rank background (moderator only)

### **Voice Channel Commands**
- `/limit` — Set voice channel user limit
- `/lock` — Lock voice channel
- `/unlock` — Unlock voice channel
- `/rename` — Rename voice channel
- `/transfer` — Transfer voice channel ownership

### **Moderation Commands**
- `/ban` — Ban a user
- `/unban` — Unban a user
- `/kick` — Kick a user
- `/timeout` — Timeout a user
- `/purge` — Delete multiple messages

### **Role Management**
- `/assign` — Assign a role to a user
- `/remove` — Remove a role from a user

### **Developer Commands**
- `/purge` — Deletes all messages from the current channel (CNS Developer only)
- `/setbackground` — Upload a background image for rank cards (CNS Developer only)
- `/tag-sync` — Manually sync CNS tag roles (CNS Developer only)
- `/migrate-message-xp` — Count all messages per user and update message XP accordingly (CNS Developer only)

---

## 🔄 Tag Sync System

The bot uses Discord's API to check users' server tag status without requiring OAuth tokens:

1. **API Check**: Fetches user data using bot token from `https://discord.com/api/users/{userId}`
2. **Tag Detection**: Checks `primary_guild.identity_enabled` and `identity_guild_id`
3. **Role Management**: Automatically assigns/removes CNS Official role based on tag status
4. **Real-time Updates**: Responds to `