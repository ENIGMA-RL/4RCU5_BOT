# 4RCU5 — CNS Discord Bot

## Features

### Leveling System
- Message and voice XP tracking
- Automatic role assignment based on levels
- Configurable role persistence
- Leaderboard and rank display
- Custom rank card backgrounds
- Configurable command cooldowns with staff exemptions
- Dev-only XP leaderboard with pagination
- Level recalculation tools

### Voice Channel Management
- Temporary channel creation
- User permissions (lock, limit, rename)
- Automatic channel cleanup
- Ownership transfer system
- Join-to-create system with role restrictions

### Moderation Tools
- Ban, kick, timeout commands
- Bulk message deletion
- Automatic invite link blocking
- Action logging to designated channels
- Role-based permission system
- Channel slowmode management with flexible duration formats (Mod/Admin/Founder/Dev only)
- Cooldown management with action logging (Admin/Founder/Dev only)
- Database cleanup for deleted users
- Force cleanup for suspicious accounts

### Tag Synchronization
- Real-time role updates based on CNS server tag status
- Periodic verification (5-minute intervals)
- Discord API integration for tag status
- Manual sync commands for admins
- CNS tag equipment tracking in database
- Tag duration requirements for giveaways

### Command Cooldown System
- Per-user cooldowns for rank and leaderboard commands
- Configurable duration (default: 30 minutes)
- Staff role exemptions (Mod, Admin, Founder)
- In-memory storage with automatic cleanup
- Simple cooldown setting command (Admin/Founder/Dev only)
- Support for minutes (m), hours (h), and days (d) formats
- Action logging to mod-log channel

### Staff Management
- Auto-updating staff embeds
- Role synchronization across server
- Hierarchical permission system
- Rules embed management

### Birthday System
- Birthday tracking and role assignment
- Automatic birthday wishes
- Special birthday role management

### Giveaway System
- Create and manage giveaways (Admin/Dev only)
- CNS tag integration for eligibility
- Booster bonus (2 tickets vs 1)
- Button-based controls
- State management (draft → open → closed → drawn → published)
- Winner privacy until published

### Ticket System
- Support ticket creation and management
- Staff assignment and tracking
- Ticket lifecycle management

### Statistics Tracking
- Server member counts
- CNS tag holder counts
- Auto-updating statistics embeds

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
- `commandCooldowns.json` - Command cooldown settings and staff exemptions
- `dynamicCooldowns.json` - Dynamic cooldown management
- `bot.json` - Bot settings
- `staff.json` - Staff role definitions
- `vcSettings.json` - Voice channel settings
- `events.json` - Event configurations
- `giveaway.json` - Giveaway system configuration
- `tickets.json` - Ticket system configuration
- `oauth.json` - OAuth application settings

### Running
```bash
npm run start  # Production
npm run dev    # Development
```

## Commands

### General (13)
- `/help`, `/info`, `/ping`, `/say`, `/refreshstats`, `/refreshstaff`, `/birthday`, `/birthday-list`, `/funfact`, `/dadjoke`, `/replyAsBot`, `/tagstatus`, `/giveaway`

### Leveling (8)
- `/levels`, `/leaderboard`, `/rank`, `/setbackground`, `/synclevelroles`, `/dev-xp-leaderboard`, `/recalculate-levels`, `/roles`

### Voice Channels (7)
- `/limit`, `/lock`, `/unlock`, `/rename`, `/transfer`, `/claim`, `/allow`

### Moderation (13)
- `/ban`, `/unban`, `/kick`, `/timeout`, `/untimeout`, `/purge`, `/setxp`, `/tag-sync`, `/migrate-message-xp`, `/cooldown`, `/slowmode`, `/cleanup-database`, `/force-cleanup`, `/set-activity-status`

### Role Management (2)
- `/assign`, `/remove`

## Technical Details

### Architecture
- **42 Commands** across 5 categories
- **6 Event Handlers** for real-time processing
- **11 Feature Modules** for core functionality
- **12 Configuration Files** for customization
- **SQLite Database** for data persistence

### Project Structure
```
src/
├── commands/          # Command handlers
│   ├── general/      # Basic commands (12)
│   ├── levels/       # Leveling commands (8)
│   ├── mod/          # Moderation tools (13)
│   ├── roles/        # Role management (2)
│   └── vc/           # Voice channel controls (7)
├── config/           # Configuration files (12)
├── database/         # Database operations
├── events/           # Discord event handlers
├── features/         # Core features (11)
│   ├── birthday/     # Birthday management
│   ├── events/       # Team events
│   ├── giveaway/     # Giveaway system
│   ├── leveling/     # XP and leveling
│   ├── logger/       # Logging system
│   ├── presence/     # Bot presence management
│   ├── staff/        # Staff management
│   ├── stats/        # Statistics tracking
│   ├── system/       # System utilities
│   ├── tagSync/      # CNS tag synchronization
│   ├── tickets/      # Support ticket system
│   └── voiceChannels/# Voice channel management
├── loaders/          # Command/event loading
└── utils/            # Utility functions
```

### Database
- User XP and level tracking
- Voice channel management
- Server statistics
- CNS tag equipment tracking
- Birthday information
- Giveaway data and entries
- Ticket management

### Events
- Member join/leave/update
- Message creation/deletion/update
- Voice state changes
- Interaction handling
- Guild member updates

## Requirements

### Bot Permissions
- `GUILD_MEMBERS`, `MANAGE_ROLES`, `MANAGE_CHANNELS`
- `SEND_MESSAGES`, `EMBED_LINKS`, `ATTACH_FILES`
- `USE_EXTERNAL_EMOJIS`, `MANAGE_MESSAGES`
- `MANAGE_GUILD`, `VIEW_AUDIT_LOG`

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

### Recent Additions
- **CNS Tag System**: Tracks when users equip/unequip CNS server tags
- **Giveaway System**: Complete giveaway management with CNS tag integration
- **Enhanced Birthday System**: Birthday tracking and role management
- **Tag Status Command**: Check CNS tag equipment status
- **Improved Statistics**: Real-time server statistics tracking

