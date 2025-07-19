# 4RCU5 — CNS Discord Bot


## Features

### Leveling System
- Message and voice XP tracking
- Automatic role assignment based on levels
- Configurable role persistence
- Leaderboard and rank display
- Custom rank card backgrounds

### Voice Channel Management
- Temporary channel creation
- User permissions (lock, limit, rename)
- Automatic channel cleanup
- Ownership transfer system

### Moderation Tools
- Ban, kick, timeout commands
- Bulk message deletion
- Automatic invite link blocking
- Action logging to designated channels
- Role-based permission system

### Tag Synchronization
- Real-time role updates
- Periodic verification (5-minute intervals)
- Discord API integration for tag status
- Manual sync commands for admins

### Staff Management
- Auto-updating staff embeds
- Role synchronization across server
- Hierarchical permission system

## Setup

### Installation
```bash
git clone https://github.com/ENIGMA-RL/4RCU5_BOT.git
cd 4RCU5_BOT
npm install
```

### Configuration
```bash
cp env.example .env
# Edit .env with bot token and client ID
```

Required configuration files in `src/config/`:
- `roles.json` - Role IDs and level assignments
- `channels.json` - Channel IDs for logs and features
- `levelSettings.json` - XP thresholds and role mappings
- `bot.json` - Bot settings
- `staff.json` - Staff role definitions
- `vcSettings.json` - Voice channel settings
- `events.json` - Event configurations

### Running
```bash
npm run start  # Production
npm run dev    # Development
```

## Commands

### General (5)
- `/help`, `/info`, `/ping`, `/say`, `/refreshstats`

### Leveling (5)
- `/levels`, `/leaderboard`, `/rank`, `/setbackground`, `/synclevelroles`

### Voice Channels (7)
- `/limit`, `/lock`, `/unlock`, `/rename`, `/transfer`, `/claim`, `/allow`

### Moderation (9)
- `/ban`, `/unban`, `/kick`, `/timeout`, `/untimeout`, `/purge`, `/setxp`, `/tag-sync`, `/migrate-message-xp`

### Role Management (2)
- `/assign`, `/remove`

## Technical Details

### Architecture
- **28 Commands** across 5 categories
- **6 Event Handlers** for real-time processing
- **10 Feature Modules** for core functionality
- **7 Configuration Files** for customization
- **SQLite Database** for data persistence

### Project Structure
```
src/
├── commands/          # Command handlers
│   ├── general/      # Basic commands
│   ├── levels/       # Leveling commands
│   ├── mod/          # Moderation tools
│   ├── roles/        # Role management
│   └── vc/           # Voice channel controls
├── config/           # Configuration files
├── database/         # Database operations
├── events/           # Discord event handlers
├── features/         # Core features
├── loaders/          # Command/event loading
└── utils/            # Utility functions
```

### Database
- User XP and level tracking
- Voice channel management
- Server statistics

### Events
- Member join/leave/update
- Message creation
- Voice state changes
- Interaction handling

## Requirements

### Bot Permissions
- `GUILD_MEMBERS`, `MANAGE_ROLES`, `MANAGE_CHANNELS`
- `SEND_MESSAGES`, `EMBED_LINKS`, `ATTACH_FILES`
- `USE_EXTERNAL_EMOJIS`, `MANAGE_MESSAGES`

### Environment
- Node.js 18+
- Discord.js v14
- better-sqlite3
- dotenv

## Development

Commands auto-register on startup. To add new commands:
1. Create file in `src/commands/[category]/`
2. Export `data` (command definition) and `execute` (handler)
3. Supports role-based permissions and cooldowns

