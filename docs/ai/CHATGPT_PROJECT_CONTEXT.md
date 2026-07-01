# FrozenThrone AI Project Context

## Server
- TrinityCore WotLK 3.3.5a
- Website path: /var/www/frozenthrone
- Repo: https://github.com/CraftEarth/Frozen-Throne
- Node service: frozenthrone-web

## Backup Rules
- Always backup before edits.
- Never backup public/downloads, downloads, node_modules, cache, or huge render assets.
- Always run:
  node --check server.js
  systemctl restart frozenthrone-web

## Website Direction
Navbar:
Home | News | Database | Top Players | Vote | Shop

Database:
Items default, with tabs for Items, NPCs, Quests.

Character Sheet V2:
- Sharp square database style
- Left: equipment list
- Center: 3D ragdoll viewer
- Right: summary/player data
- Bottom: tabs for Summary, Stats, Talents, Inventory, Achievements, Activity, Forums

Account Page:
- Should mimic character sheet style
- Shows account characters
- Later forum posts, comments, chats, vote rewards

## Important Rules
- GM level 3 and 4 hidden from public stats/search/lists.
- Direct true paths must still work for admins:
  /armory/main/GUID
  /admin/player/main/GUID

## Current Roadmap
1. Fix/polish Character Sheet V2
2. Viewer Engine V2: no stretch, clear model, cached renders
3. Dynamic class/zone backgrounds
4. Achievement engine from DBC
5. Talent engine from DBC
6. Database engine for items/NPCs/quests
7. Admin control dashboard
8. Forums/player profile system
