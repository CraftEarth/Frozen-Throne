# FrozenThrone OS Bible

## Current Mission
Build FrozenThrone OS into a complete server/community operating system for managing TrinityCore WotLK 3.3.5a realms.

Current version: v0.3  
Current focus: Community Operations + OS Framework  
Current next major feature: Universal Inspector / Relationship Engine

---

## Vision
FrozenThrone OS is not just a website and not just a GM panel.

It is an operating system for managing an MMORPG server.

Main goal:
- Replace daily DBeaver work.
- Replace repeated GM command work.
- Connect players, accounts, items, NPCs, vendors, quests, rewards, logs, and realms.
- Make server ownership faster, safer, and easier.

---

## Core Rules

1. Every admin action must be logged.
2. Every write tool must be realm-aware.
3. Production changes should be obvious.
4. Beta/testing should be easy.
5. Every major object should connect to related objects.
6. Routine database work should move into FrozenThrone OS.
7. DBeaver should become emergency/deep-work only.
8. Build modules/apps, not random pages.
9. Keep UI consistent across all admin tools.
10. Think six months ahead before adding shortcuts.

---

## Current Completed Features

### Website
- Public homepage
- News
- Players page
- Download page
- Register/login/account system

### Admin / Control Center
- GM-only admin access
- Admin dashboard
- Admin navigation
- Activity log

### Realm System
- `ft_realm_config`
- Production/Beta rows
- Active realm cookie
- Realm switcher
- Active realm banner
- `/admin` dashboard uses active realm

### Rewards
- Sends in-game mail
- Supports optional item
- Supports message-only
- Supports money-only
- Supports item + money
- Supports gold/silver/copper
- Logs reward sends

### Items
- Item search
- Item icons from DBC/icon mapping
- Item detail page
- Owners
- Vendors
- Drops
- Custom item badge
- Copy `.additem`

### Players / Accounts
- Player inspector
- Account inspector
- Character inventory
- Armory links

### NPCs
- NPC search
- NPC inspector
- Spawn locations
- Vendor items
- Loot
- Quest starter/ender links

### Vendors
- Vendor editor
- Add vendor item
- Remove vendor item
- Logs changes
- Realm-aware started

### Quests
- Quest search
- Quest inspector
- Starters
- Enders
- Required items
- Reward items
- Quest editor v1

### Global Search
- Searches players
- Accounts
- Items
- NPCs
- Quests
- Logs
- Uses active realm

---

## Custom Database Tables

### auth.ft_admin_log
Purpose: audit trail for GM/backend actions.

Used for:
- Rewards
- Vendor edits
- Quest edits
- Future server actions

### auth.ft_realm_config
Purpose: realm configuration source of truth.

Columns include:
- realm_id
- realm_key
- display_name
- world_db
- characters_db
- auth_db
- is_production
- enabled

Current rows:
- main → world / characters
- beta → world_beta / characters_beta

---

## Current Architecture

Current stage: monolith transitioning to modules.

Current code:
- `server.js` contains most routes.
- `modules/` folder created for future split.
- `docs/` folder created for project memory.
- `scripts/` folder created for helper scripts.
- `backups/` folder created for safer project backups.

Future target:
- `server.js` should become core loader.
- Each app/module should live in its own file.

Example future layout:

modules/
- search.js
- rewards.js
- inspector.js
- npcs.js
- quests.js
- realms.js
- logs.js
- players.js
- accounts.js

---

## UI Direction

Admin pages should feel like FrozenThrone OS, not public website pages.

Admin navigation:
- Dashboard
- Search
- NPCs
- Items
- Quests
- Mail/Rewards
- Logs
- Realms

Every admin module should eventually have:
- Active realm badge
- Search/action bar
- Quick actions
- Related links
- History/log section
- Consistent layout

---

## Version Roadmap

### v0.3 — Community Operations / OS Framework
Status: In Progress

Goals:
- Rewards polish
- Reward templates
- Global Search
- Universal Inspector
- Relationship Engine
- Bible/docs
- Begin module split

### v0.4 — Content Studio
Planned

Goals:
- NPC Creator
- Quest Creator
- Loot Editor
- Vendor Creator
- Item Clone/Edit tools
- GameObject tools

### v0.5 — Realm Operations
Planned

Goals:
- Realms page
- Service status
- Start/stop/restart worldservers
- Show ports
- Realm Creator
- Clone Beta to new realm
- Publish Beta changes to Production

### v0.6 — Community + Automation
Planned

Goals:
- Event Manager
- Art contest / Discord event workflow
- Broadcast Center
- Vote rewards
- Shop delivery
- Reward history/statistics
- Discord integration later

---

## Major Future Ideas

### Universal Inspector
One inspector layout for:
- Player
- Account
- Item
- NPC
- Quest
- Guild
- Realm

Sections:
- Summary
- Relationships
- Actions
- History

### Relationship Engine
Answer questions like:
- Who owns this item?
- What NPC sells it?
- What drops it?
- What quests require/reward it?
- Has it been sent through Rewards?
- What templates reference it?

### Rewards Center
Rename Mail UI concept to Rewards.

Must support:
- Item rewards
- Money rewards
- Message-only mail
- Templates
- Event payouts
- Vote rewards
- Shop rewards
- Reward history

### Events App
Support:
- Discord events
- Art contests
- Screenshot contests
- PvP tournaments
- Trivia
- Hide and seek
- Winner payouts

### Plugin/App System
Long-term:
- apps/rewards
- apps/events
- apps/npcstudio
- apps/queststudio
- apps/discord
- apps/votes
- apps/shop

Apps should be enable/disable capable.

---

## Session Startup Rule

At the start of a new session, say:

"Open the Bible. Refresh yourself. Continue v0.3."

Then read this file first and continue from Current Mission.


---

## Armory Ragdoll Render Plan

Goal:
Show real character renders on public Armory profiles.

Current loader paths:
- public/images/armory/models/character-GUID.png
- public/images/armory/portraits/character-GUID.png

Fallback paths:
- public/images/armory/models/race-gender-class.svg
- public/images/armory/portraits/race-gender-class.svg

Data source:
- TrinityCore characters table for race, gender, class, level, name
- character_inventory + item_instance for equipped item IDs
- item_template for item display IDs

Asset source:
- WoW 3.3.5a client files / MPQ assets

Render options:
1. Manual export with WoW Model Viewer.
2. Semi-automated export screenshots named by character GUID.
3. Future browser 3D viewer using client assets.

Rule:
Do not waste more time on fake placeholders. Use placeholders only as fallbacks.

========================================================
ARCHITECTURE DECISION #0001
Date: 2026-06-28

TITLE
Realm-Aware Character Rendering

RULE

Every character render, manifest, cache file, portrait, and 3D viewer
must include the realm key.

Examples:

/armory/main/24
/armory/beta/24

Cache Examples:

character-main-24-wowviewer.json
character-beta-24-wowviewer.json

character-main-24.png
character-beta-24.png

REASON

The same player may exist on multiple realms with different:

- Level
- Gear
- Talents
- Gold
- Stats
- Appearance
- Achievements

Using only the character GUID or name for caching will cause one realm
to overwrite another.

STATUS

Current renderer still uses character-24 for testing.
Before production, all renderer output must become realm-aware.

========================================================
# FrozenThrone Development Bible

Version: 1.0

---

# Purpose

This document defines how FrozenThrone is engineered.

The goal is consistency, stability, and maintainability.

Every new feature should follow these standards.

---

# Project Philosophy

Quality over speed.

Never sacrifice stability for a shortcut.

Always build reusable systems instead of one-off fixes.

GitHub is the source of truth.

---

# Core Stack

Game Server
- TrinityCore 3.3.5a

Website
- Node.js

Database
- MySQL

Frontend
- HTML
- CSS
- JavaScript

Version Control
- Git
- GitHub

---

# Folder Structure

modules/
    armory/
    account/
    guilds/
    news/
    vote/
    shop/

public/
    css/
    js/
    images/
    vendor/

docs/
    CHATGPT_PROJECT_CONTEXT.md
    ROADMAP.md
    BIBLE.md

---

# Coding Rules

Never edit production blindly.

Always:

1. Backup
2. Edit
3. Syntax check
4. Restart
5. Test
6. Commit
7. Push

---

# Git Workflow

git add .
git commit -m "Describe feature"
git push

Every completed feature must be committed.

---

# Node Rules

Never restart Node until syntax checks pass.

Always run:

node --check server.js

before restarting.

---

# Armory Standards

Character pages should feel like Blizzard quality.

Goals:

Fast

Responsive

Mobile friendly

Minimal loading

High quality rendering

No stretched models

Clear UI

---

# UI Standards

Consistent spacing

Square corners with subtle styling

Dark FrozenThrone theme

Readable fonts

No clutter

Professional appearance

---

# Performance

Cache expensive operations.

Avoid duplicate database queries.

Keep pages under one second when possible.

---

# Security

Hide GM accounts from public pages.

Protect admin routes.

Never expose passwords or secrets.

Never commit tokens or credentials.

---

# Backups

Every major feature:

Git commit

GitHub push

Server backup

No exceptions.

---

# Long-Term Goal

Build the best Wrath of the Lich King private server website possible.

Everything should feel polished, stable, and professionally engineered.
