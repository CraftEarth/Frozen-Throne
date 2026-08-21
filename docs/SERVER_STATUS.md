# FrozenThrone Server Status

Last updated: 2026-08-21

Development line: **v0.4-dev**

## Current Platform Status

FrozenThrone currently operates three WoW realms plus the FrozenThrone website.

Verified active services:

- `frozenthrone-web.service`
- `authserver.service`
- `worldserver.service`
- `worldserver-beta.service`
- `frozenthrone-shadow-auth.service`
- `frozenthrone-shadow-world.service`

All listed services were verified active on 2026-08-21.

---

## Website

Status: **Active**

Project root:

`/var/www/frozenthrone`

Systemd service:

`frozenthrone-web.service`

Working directory:

`/var/www/frozenthrone`

Runtime:

`/usr/bin/node /var/www/frozenthrone/server.js`

Internal Node port:

`3000`

The production website runs directly through systemd rather than PM2.

---

## Realm 1 — FrozenThrone

Status: **Active / Production**

Core:

TrinityCore WotLK 3.3.5a

Realm ID:

`1`

Worldserver port:

`8085`

Install path:

`/opt/trinity`

Authserver binary:

`/opt/trinity/bin/authserver`

Worldserver binary:

`/opt/trinity/bin/worldserver`

World configuration:

`/opt/trinity/etc/worldserver.conf`

Services:

- `authserver.service`
- `worldserver.service`

Databases:

- Auth: `auth`
- Characters: `characters`
- World: `world`

FrozenThrone is the primary TrinityCore production realm.

Production databases must not be used for destructive experiments.

---

## Realm 2 — Solo Beta

Status: **Active / Testing**

Core:

TrinityCore WotLK 3.3.5a

Realm ID:

`2`

Worldserver port:

`8086`

Install path:

`/opt/trinity-beta`

Worldserver binary:

`/opt/trinity-beta/bin/worldserver`

World configuration:

`/opt/trinity-beta/etc/worldserver.conf`

Service:

`worldserver-beta.service`

Databases:

- Auth: `auth`
- Characters: `characters_beta`
- World: `world_beta`

Solo Beta shares the primary TrinityCore authentication database but uses isolated character and world databases.

Purpose:

- Gameplay experiments
- Solo-content testing
- Balance testing
- Development validation before production changes

Solo Beta should remain isolated from production character/world data.

---

## Realm 3 — Shadowmourne

Status: **Active / Production**

Core:

AzerothCore / PlayerBots

Realm ID:

`3`

Worldserver port:

`8087`

Install path:

`/opt/azerothcore-playerbots`

Authserver binary:

`/opt/azerothcore-playerbots/bin/authserver`

Worldserver binary:

`/opt/azerothcore-playerbots/bin/worldserver`

Auth configuration:

`/opt/azerothcore-playerbots/etc/authserver.conf`

World configuration:

`/opt/azerothcore-playerbots/etc/worldserver.conf`

Services:

- `frozenthrone-shadow-auth.service`
- `frozenthrone-shadow-world.service`

Databases:

- Auth: `acore_auth`
- Characters: `acore_characters`
- World: `acore_world`

Shadowmourne is the production AzerothCore / PlayerBots realm.

It is intentionally separated from the TrinityCore realm databases.

---

## Realm Port Map

| Realm | Realm ID | Port | Status |
|---|---:|---:|---|
| FrozenThrone | 1 | 8085 | Production |
| Solo Beta | 2 | 8086 | Testing |
| Shadowmourne | 3 | 8087 | Production |

---

## Database Map

### FrozenThrone

`auth`

`characters`

`world`

### Solo Beta

`auth`

`characters_beta`

`world_beta`

### Shadowmourne

`acore_auth`

`acore_characters`

`acore_world`

---

## Current Disk Status

Verified 2026-08-21:

- Filesystem: `/dev/sda1`
- Total size: `193G`
- Used: `86G`
- Available: `108G`
- Usage: `45%`

This replaces the obsolete July 2026 disk figures.

---

## Recovery Backup History

A previously verified FrozenThrone recovery backup exists at:

`/root/frozenthrone-backups/20260711-205051`

Historically verified files included:

- `auth.sql.gz`
- `characters.sql.gz`
- `world.sql.gz`
- `realm1-configs.tar.gz`
- `SHA256SUMS.txt`

That backup represents an earlier FrozenThrone production recovery point and should not be treated as a current full backup of every realm.

A fresh multi-realm backup strategy should be added during the Realm Operations phase.

---

## Current Development Safety Checkpoint

Before beginning FrozenThrone OS v0.4 work, the live website working tree was preserved at:

`/root/frozenthrone-live-checkpoint-20260821-201233`

This checkpoint protects the current live Armory/modelviewer/server experiments while documentation and architecture work continue separately.

---

## Git Development State

Current v0.4 development branch:

`agent/frozenthrone-os-v04-20260821`

The branch is used to keep FrozenThrone OS development separate from `main` until the checkpoint is reviewed and ready to merge.

Live uncommitted production experiments must not be accidentally included in documentation commits.

---

## Important Safety Rules

1. Verify the current shell and project directory before running commands.
2. Never delete or overwrite `/opt/trinity`.
3. Never delete or overwrite `/opt/trinity-beta`.
4. Never delete or overwrite `/opt/azerothcore-playerbots`.
5. Never experiment destructively against production databases.
6. Back up before schema migrations or large content changes.
7. Keep realm-specific database writes explicit.
8. Prefer Solo Beta for experimental TrinityCore gameplay changes.
9. Do not use `git add .` on the live VPS.
10. Stage only files intended for each commit.
11. Run Node syntax checks before restarting the website.
12. Preserve working live features before refactoring.
13. Do not merge v0.4 work into `main` until the checkpoint is reviewed.

---

## Next Infrastructure Work

Planned during the FrozenThrone OS roadmap:

- Universal Inspector
- Relationship Engine
- Content Studio
- Realm Operations dashboard
- Service health monitoring
- Backup integration
- Beta-to-production workflows
- Audited administrative actions

The goal is for FrozenThrone OS to become the primary control layer for the entire server platform.
