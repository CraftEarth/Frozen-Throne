# FrozenThrone OS Roadmap

Last updated: 2026-08-21

Development line: **v0.4-dev**

## Vision

FrozenThrone is no longer just a website.

The goal is to build a connected server operating system for:

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
- Administration

The long-term goal is to reduce routine dependence on:

- DBeaver
- raw SQL
- SSH
- repetitive GM commands

## Development Rules

1. Back up before risky changes.
2. Make small, reviewable changes.
3. Test before production restarts.
4. Run syntax checks before restarting Node.
5. Never use `git add .` on the live VPS.
6. Stage only the files intended for each commit.
7. Keep realm-specific writes explicit.
8. Preserve working production features before refactoring.

## Current Development Priority

The current order is:

1. Architecture checkpoint
2. Universal Inspector
3. Relationship Engine
4. Connected Item / NPC / Quest / Player views
5. Content Studio
6. Realm Operations
7. Automation

## Completed Foundation

### Public Platform

- Home
- News
- Registration
- Login
- Account system
- Player pages
- Character profiles
- Download / launcher delivery
- SEO

### Armory

- Custom Armory
- Equipment viewer
- Character sheet layout
- Live 3D character viewer
- Renderer pipeline
- Custom item presentation
- NPC 3D presentation

### Database

- Item lookup
- NPC lookup
- Quest lookup
- Vendor relationships
- Loot relationships
- Spawn information
- Quest starter / ender relationships

### Administration

- Admin Control Center
- Player inspection
- Account inspection
- Global search
- Reward / mail tooling
- Activity logging
- Realm-aware foundations

### Community

- Member profiles
- Member privacy
- Member Wall
- Community module
- Guild module

### Economy and Engagement

- Vote system
- Vote administration
- Shop
- Reward foundation

## v0.4 — Connected World / Content Studio Foundation

Status: **ACTIVE**

### Phase 1 — Architecture Checkpoint

- [x] Protect current live working tree
- [x] Create v0.4 development branch
- [x] Refresh project README
- [x] Add architecture baseline
- [x] Refresh roadmap
- [ ] Establish changelog
- [ ] Audit current services and realms
- [ ] Refresh server status documentation
- [ ] Refresh project reference documentation

### Phase 2 — Universal Inspector

Build one reusable inspection system for:

- [ ] Players
- [ ] Accounts
- [ ] Items
- [ ] NPCs
- [ ] Quests
- [ ] Guilds
- [ ] Realms

Each inspector should eventually show:

- Summary
- Relationships
- Actions
- History

### Phase 3 — Relationship Engine

Connect related game and website data.

Examples:

- Item → Owners
- Item → Vendors
- Item → Loot Sources
- Item → Quests
- NPC → Spawns
- NPC → Vendor Inventory
- NPC → Loot
- NPC → Quests
- Player → Account
- Player → Guild
- Player → Equipment
- Player → Rewards

### Phase 4 — Content Studio

Build safe creation and editing tools for game content.

Planned tools:

- [ ] NPC Creator
- [ ] NPC Clone / Edit
- [ ] Vendor Creator
- [ ] Vendor Editor
- [ ] Loot Editor
- [ ] Quest Creator
- [ ] Quest Editor
- [ ] Item Clone / Edit
- [ ] GameObject tools

Requirements:

- Realm-aware
- Logged
- Validated before writes
- Clear Production vs Beta indicators
- Reusable UI
- Reusable data services

## v0.5 — Realm Operations

Status: **PLANNED**

Planned work:

- [ ] Realm dashboard
- [ ] Service status
- [ ] Start / stop / restart worldserver
- [ ] Authserver status
- [ ] Port checks
- [ ] Realm health checks
- [ ] Realm configuration
- [ ] Backup integration
- [ ] Beta-to-production publishing workflow

Production operations must require explicit safeguards.

## v0.6 — Automation and Community Operations

Status: **PLANNED**

Planned work:

- [ ] Event Manager
- [ ] Discord integration
- [ ] Broadcast Center
- [ ] Automated vote rewards
- [ ] Automated shop delivery
- [ ] Reward templates
- [ ] Reward history
- [ ] Contest tools
- [ ] Bug report workflow
- [ ] Suggestion workflow

## Future

Possible later systems:

- Interactive world map
- Raid progression
- Arena rankings
- Character comparison
- Talent system
- Achievements
- Professions
- Mount collection
- Pet collection
- Reputation
- Spellbook
- Guild progression
- Marketplace
- Transmog viewer
- Public API
- Mobile improvements

## Development Principle

Priority order:

**Connect → Inspect → Validate → Edit → Automate**

Build connected systems before adding isolated features.
