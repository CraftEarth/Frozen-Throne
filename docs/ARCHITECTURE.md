# FrozenThrone OS Architecture

Last updated: 2026-08-21

Development line: **v0.4-dev**

## Purpose

FrozenThrone OS connects the website, game realms, databases, players, content, community systems, and administrative tools into one platform.

The goal is to reduce dependence on raw SQL, DBeaver, SSH, and repetitive GM commands.

## Website Runtime

Project root:

`/var/www/frozenthrone`

Website service:

`frozenthrone-web.service`

Working directory:

`/var/www/frozenthrone`

Execution:

`/usr/bin/node /var/www/frozenthrone/server.js`

Internal Node port:

`3000`

## Realms

### FrozenThrone

- Realm ID: `1`
- Core: TrinityCore 3.3.5a
- Auth database: `auth`
- Character database: `characters`
- World database: `world`
- World port: `8085`

### Shadowmourne

- Realm ID: `3`
- Core: AzerothCore / PlayerBots
- Auth database: `acore_auth`
- Character database: `acore_characters`
- World database: `acore_world`
- World port: `8087`

Current services:

- `frozenthrone-shadow-auth.service`
- `frozenthrone-shadow-world.service`

### Solo Beta

Solo Beta is maintained as a separate testing environment.

Current service:

`worldserver-beta.service`

Its exact database and binary configuration will be documented after the service audit.
