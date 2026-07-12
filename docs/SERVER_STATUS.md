# FrozenThrone Server Status

Last updated: July 12, 2026

## Realm 1 — Live

- Status: Active
- Core: TrinityCore WotLK 3.3.5a
- Install path: `/opt/trinity`
- Worldserver binary: `/opt/trinity/bin/worldserver`
- Configuration: `/opt/trinity/etc/worldserver.conf`
- Systemd service: `worldserver.service`
- Realm ID: 1
- Worldserver port: 8085
- Databases:
  - `auth`
  - `characters`
  - `world`

Realm 1 must not be modified, stopped, replaced, or deleted while working on additional realms unless explicitly required.

## Retired Test Realms

The previous beta, NPCBots, and failed legacy PlayerBots test installations were removed to recover disk space.

Removed paths included:

- `/opt/trinity-beta`
- `/home/trinity/server-bots`
- `/home/trinity/server-playerbots`
- `/usr/src/TrinityCore/build-bots`
- `/usr/src/TrinityCore-playerbots`
- `/usr/src/TrinityCore-playerbots-build`

The old disabled `worldserver-beta.service` was also removed.

## Verified Recovery Backup

Backup location on the VPS:

`/root/frozenthrone-backups/20260711-205051`

Verified backup files:

- `auth.sql.gz`
- `characters.sql.gz`
- `world.sql.gz`
- `realm1-configs.tar.gz`
- `SHA256SUMS.txt`

Validation results:

- AUTH OK
- CHARACTERS OK
- WORLD OK
- CONFIG OK

The website backup excludes:

`/var/www/frozenthrone/public/downloads`

That folder contains the large downloadable WoW client and remains in its original location.

## Disk Status After Cleanup

- Filesystem size: approximately 96 GB
- Free space after cleanup and backup correction: approximately 22 GB
- Usage: approximately 79%

## New PlayerBots Forks

FrozenThrone now controls these GitHub forks:

- `CraftEarth/azerothcore-wotlk`
  - Branch: `Playerbot`
- `CraftEarth/mod-playerbots`
  - Branch: `master`

Upstream projects:

- `mod-playerbots/azerothcore-wotlk`
- `mod-playerbots/mod-playerbots`

## Planned PlayerBots Realm

Planned separate installation:

- Core type: AzerothCore PlayerBots
- Realm ID: 3
- Worldserver port: 8087
- Source path: `/usr/src/FrozenThrone-playerbots`
- Install path: `/home/trinity/server-playerbots`
- Planned databases:
  - `world_playerbots`
  - `characters_playerbots`
  - temporary `auth_playerbots` only if needed for compatibility testing

The preferred final design is one shared login and account system for all realms. The existing live `auth` database must not be connected to AzerothCore until its schema compatibility is verified.

## Safety Rules

1. Always verify the current shell prompt before running commands.
2. Docker container prompts look like `root@<container-id>:/#`.
3. VPS host prompts look like `root@vps-3d63c583:~#`.
4. Never delete or overwrite `/opt/trinity`.
5. Never experiment directly on the live `auth`, `characters`, or `world` databases.
6. Create and verify backups before database migrations.
7. Keep each realm in separate source, install, configuration, and database paths.
