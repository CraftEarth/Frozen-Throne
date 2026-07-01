## Development Log - 2026-06-28

### Armory Progress

* Successfully integrated live WoW model viewer into the Armory.
* Character equipment now renders from local manifest files.
* Fixed armor slot mapping after robe/chest regression.
* Fixed dual-wield weapon rendering for one-handed weapons.
* Added fallback rendering support for custom weapons without model metadata.
* Restored full armor rendering after viewer regression.
* Simplified portrait system to a stable static class portrait while continuing renderer development.

### SEO Improvements

* Added centralized SEO engine.
* Added dynamic page titles.
* Added meta descriptions.
* Added Open Graph support.
* Added Twitter/X card metadata.
* Added default social sharing image support.

### Project Improvements

* Continued separating Armory into modular components.
* Improved renderer independence from Wowhead.
* Created multiple rollback backups before major changes.
* Confirmed local model pipeline is capable of rendering character equipment from TrinityCore data.

### Planned Next Session

1. Hide GM level 3 and 4 characters from all public pages.
2. Finish Armory portrait section.
3. Polish Armory UI.
4. Begin full Item Database.
5. Continue custom renderer improvements.

### Current Project Status

The FrozenThrone website has progressed beyond a standard TrinityCore website. The project now includes a custom Armory renderer, SEO engine, modular architecture, and the foundation for a complete game database integrated directly with the website.

## Development Log - 2026-06-30

### Frontend Direction Revised

The website navigation will be simplified to focus on the main public systems:

- Home
- News
- Database
- Top Players
- Vote
- Shop

The Database page will become the main Armory-style database hub. It should open directly to Items by default and include tabs for:

- Items
- NPCs
- Quests

Character sheets will no longer be treated as the main Armory landing page. Character sheets are now considered player/account profile pages.

### Character Sheet V2 Direction

The current character sheet layout is only temporary. The final direction is a sharp, compact, database-style layout with:

- Thin borders
- Square panels
- Tight spacing
- Dark blue/black theme
- Gear list on the left
- Ragdoll/3D model in the center
- Summary, stats, activity, and profile panels on the right
- Tabs for gear, stats, talents, professions, achievements, activity, and future forum/profile data

The target style is closer to a full game database/player profile dashboard rather than large rounded cards.

### Account/Profile Direction

The account page should eventually mimic the player character sheet style and become the player’s full FrozenThrone identity page.

It should include:

- Characters created by that account
- Selected main character/profile
- Forum posts
- Comments/chats
- Account activity
- Vote rewards
- Player/community history

### GM Visibility

GM level 3 and 4 characters should be hidden from public player rankings, player stats, Armory/database searches, and public website lists.

Direct true paths should still work for admin inspection, such as:

- /armory/main/GUID
- /admin/player/main/GUID

### Current Status

Frontend V1 is still being stabilized. The next goal is to stop patching the old layout and start building the clean Character Sheet V2 and Database-first Armory structure.
