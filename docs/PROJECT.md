# FrozenThrone OS Project Reference

## Project Root
/var/www/frozenthrone

----------------------------------------

## Main Files

server.js

package.json

item-icons.json

website.log

----------------------------------------

## Directories

public/

modules/

docs/

scripts/

backups/

node_modules/

----------------------------------------

## Documentation

docs/BIBLE.md

docs/ROADMAP.md

docs/CHANGELOG.md

docs/ARCHITECTURE.md

docs/PROJECT.md

----------------------------------------

## Public Website

public/

CSS:
public/css/

Images:
public/images/

Downloads:
public/downloads/

News:
public/news/

----------------------------------------

## Current Databases

Auth:
auth

Production World:
world

Production Characters:
characters

Beta World:
world_beta

Beta Characters:
characters_beta

----------------------------------------

## Custom Tables

auth.ft_admin_log

auth.ft_realm_config

----------------------------------------

## Services

Website

systemctl restart frozenthrone-web

World

systemctl restart worldserver

Auth

systemctl restart authserver

----------------------------------------

## Useful Commands

Restart Website

systemctl restart frozenthrone-web

Website Log

tail -f website.log

Edit Server

nano server.js

Project Tree

tree -L 2

----------------------------------------

## Current Version

v0.3

Current Mission

Universal Inspector

Relationship Engine

Rewards Center

Module Split


----------------------------------------

## Armory Image Paths

Model renders:
public/images/armory/models/

Character-specific model:
public/images/armory/models/character-GUID.png

Example:
public/images/armory/models/character-24.png

Race/class fallback model:
public/images/armory/models/race-gender-class.svg

Example:
public/images/armory/models/undead-male-death-knight.svg

Portrait renders:
public/images/armory/portraits/

Character-specific portrait:
public/images/armory/portraits/character-GUID.png

Example:
public/images/armory/portraits/character-24.png

Race/class fallback portrait:
public/images/armory/portraits/race-gender-class.svg

Example:
public/images/armory/portraits/undead-male-death-knight.svg

Ragdoll background:
public/images/frozenthrone-bg.jpeg

UI icons:
public/images/ui/

----------------------------------------

## Renderer Service

Service name:
frozenthrone-renderer

Service file:
/etc/systemd/system/frozenthrone-renderer.service

Worker:
modules/renderer/worker.js

Queue character render:
node modules/renderer/queue-character-render.js GUID main

Example:
node modules/renderer/queue-character-render.js 24 main

Run worker:
systemctl start frozenthrone-renderer

Render input:
public/renders/input/

Render queue:
public/renders/queue/

Completed jobs:
public/renders/done/

Failed jobs:
public/renders/failed/

Final model output:
public/images/armory/models/character-GUID.png

Final portrait output:
public/images/armory/portraits/character-GUID.png

----------------------------------------

## WoW Client Asset Paths

WoW client root:
/home/wowclient

WoW Data folder:
/home/wowclient/Data

Main MPQs:
/home/wowclient/Data/common.MPQ
/home/wowclient/Data/common-2.MPQ
/home/wowclient/Data/expansion.MPQ
/home/wowclient/Data/lichking.MPQ
/home/wowclient/Data/patch.MPQ
/home/wowclient/Data/patch-2.MPQ
/home/wowclient/Data/patch-3.MPQ

Locale MPQs:
/home/wowclient/Data/enUS/

----------------------------------------

## Renderer Breakthrough

Confirmed pipeline:
TrinityCore item_template.displayid
-> ItemDisplayInfo.dbc
-> item model/texture names
-> MPQ index lookup
-> extract M2/SKIN/BLP assets

Test item:
Sanctified Scourgelord Helmet
Item entry: 51312
DisplayID: 64587

Resolved DBC:
model: helm_plate_raiddeathknight_h_01.mdx
variant/texture: helm_plate_raiddeathknight_h_01red
icon: inv_helmet_151

Resolved MPQ model for Undead Male:
ITEM/ObjectComponents/Head/Helm_Plate_RaidDeathKnight_H_01_ScM.M2

Extracted from:
Data/patch-2.MPQ

Next:
Extract model skin + texture, then build M2/BLP conversion/render path.

========================================================
PROJECT UPDATE
Date: 2026-06-28
Milestone: First Live 3D Character Render
========================================================

MAJOR BREAKTHROUGH

Today FrozenThrone successfully rendered its first live 3D character using
real TrinityCore character data.

Completed pipeline:

Character Database
        ↓
Equipment
        ↓
DisplayID lookup
        ↓
ItemDisplayInfo.dbc
        ↓
MPQ Asset Resolution
        ↓
wow-model-viewer Integration
        ↓
Live Interactive Character

Completed Work

✓ Armory routes migrated into modules.
✓ Character manifest generator completed.
✓ Render queue system completed.
✓ Render worker completed.
✓ Asset resolver completed.
✓ MPQ index builder completed.
✓ DBC parser completed.
✓ DisplayID resolution working.
✓ Character exporter completed.
✓ wow-model-viewer adapter completed.
✓ Viewer embedded successfully.
✓ Interactive 3D character displayed in browser.

Renderer Status

Current:
- Character renders successfully.
- Character can be rotated.
- Helmet displays.
- Appearance data loads.

Remaining:

- Fix gender mapping.
- Verify slot mapping.
- Chest
- Legs
- Gloves
- Boots
- Cloak
- Weapons
- Shoulder rendering

Future

Replace placeholder silhouette on Armory page with
interactive live 3D character viewer.

Long-term

Generate cached renders for:

/armory
Guild pages
Top Players
Arena Ladder
Recent Kills
Character Compare

Current Progress

Website ................. 95%
Armory Backend .......... 100%
3D Viewer ............... 80%
Equipment Mapping ....... 35%

Overall FrozenThrone Project

Approximately 92% complete.

This is considered one of the largest milestones
since the project began.

========================================================
