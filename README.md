# ❄️ FrozenThrone OS

FrozenThrone is a custom World of Warcraft: Wrath of the Lich King 3.3.5a platform built with TrinityCore, AzerothCore, Node.js, MySQL, and custom web tools.

The goal is bigger than a normal private-server website.

FrozenThrone OS is being built as a connected control system for:

- Realms
- Players
- Accounts
- Armory
- Items
- NPCs
- Quests
- Guilds
- Community
- Rewards
- Voting
- Shop
- Server administration

## Current Development

**v0.4-dev**

Current focus:

- Universal Inspector
- Relationship Engine
- Realm-aware tools
- Content Studio foundation

## Current Realms

### FrozenThrone
- Realm ID: 1
- Core: TrinityCore 3.3.5a
- Databases: `auth`, `characters`, `world`
- World port: 8085

### Shadowmourne
- Realm ID: 3
- Core: AzerothCore / PlayerBots
- Databases: `acore_auth`, `acore_characters`, `acore_world`
- World port: 8087

### Solo Beta
Separate testing realm used for development and balancing.

## Website

Project root:

`/var/www/frozenthrone`

Website service:

`frozenthrone-web.service`

Runtime:

`node server.js`

Internal port:

`3000`

## Major Systems Already Built

- Custom Armory
- Character profiles
- Live 3D model viewer
- Item database
- NPC database
- Quest database
- Player pages
- Account system
- Admin Control Center
- Community system
- Guild system
- Vote system
- Shop
- Renderer pipeline
- SEO system

## Development Direction

The long-term workflow is:

`Find → Inspect → Understand Relationships → Edit Safely → Test → Publish → Audit`

The goal is to reduce dependence on raw SQL, DBeaver, SSH, and repetitive GM commands.

## Technology

- Node.js
- Express
- MySQL
- TrinityCore 3.3.5a
- AzerothCore
- JavaScript
- HTML/CSS
- systemd
- Git
- GitHub

## Safety Rules

- Protect working production changes.
- Back up before risky edits.
- Never commit secrets.
- Never stage unrelated files.
- Test before restarting production services.
- Keep realm-specific writes explicit.

## License

This project is for educational and development purposes.

World of Warcraft®, Wrath of the Lich King®, Blizzard Entertainment®, and related assets remain the property of their respective owners.
