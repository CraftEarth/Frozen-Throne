const { buildStats } = require("./engine/stats");
module.exports = function registerArmoryRoutes(app, tools) {
  const {
    render,
    errorCard,
    esc,
    realms,
    getRealm,
    databaseExists,
    characterDb,
    worldDb,
    raceName,
    className,
    moneyToGold,
    itemIconUrl,
    itemQualityName
  } = tools;

app.get("/armory", async (req, res) => {
  render(req, res, "FrozenThrone Database", `
    <main class="container">
      <section>
        <div class="section-head">
          <p class="eyebrow">FrozenThrone Armory</p>
          <h1>FrozenThrone Game Database</h1>
          <p>Browse characters, items, NPCs, quests, gear, vendors, loot, and live server data outside the game.</p>
        </div>

        <div class="card highlight armory-db-hero">
          <h2>Explore FrozenThrone</h2>
          <p class="muted">This is the public database hub. Characters are only one part of it now.</p>
          <div class="grid grid-4">
            <a class="card admin-card" href="/armory/characters"><h3>👥 Characters</h3><p class="muted">Player profiles, gear, level, class, and online status.</p></a>
            <a class="card admin-card" href="/armory/items"><h3>🎒 Items</h3><p class="muted">Search gear, weapons, bags, consumables, and custom items.</p></a>
            <a class="card admin-card" href="/armory/npcs"><h3>🧙 NPCs</h3><p class="muted">Browse vendors, creatures, quest NPCs, and loot sources.</p></a>
            <a class="card admin-card" href="/armory/quests"><h3>📜 Quests</h3><p class="muted">Search quests, rewards, objectives, starters, and enders.</p></a>
          </div>
        </div>

        <div class="grid grid-3">
          <div class="card"><h3>⚔️ Live Server Data</h3><p class="muted">Profiles and item ownership come directly from your realm database.</p></div>
          <div class="card"><h3>❄️ FrozenThrone Style</h3><p class="muted">Built like a modern WoW database with our dark ice theme.</p></div>
          <div class="card"><h3>🔎 Search Everything</h3><p class="muted">Items, NPCs, quests, and characters will all become connected.</p></div>
        </div>
      </section>
    </main>
  `);
});

app.get("/armory/characters", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const cards = [];

    for (const realm of realms) {
      const exists = await databaseExists(realm.db);
      if (!exists) continue;

      const conn = await characterDb(realm.db);
      const params = [];
      let where = "(c.deleteDate IS NULL OR c.deleteDate = 0) AND COALESCE(aa.SecurityLevel, 0) <= 2";
      if (search) {
        where += " AND c.name LIKE ?";
        params.push(`%${search}%`);
      }

      const [chars] = await conn.execute(
        `SELECT c.guid, c.account, c.name, c.race, c.class, c.level, c.money, c.online, c.totalKills
         FROM characters c
         LEFT JOIN auth.account_access aa
           ON aa.AccountID = c.account AND aa.RealmID IN (-1, 0)
         WHERE ${where}
         ORDER BY c.level DESC, c.name ASC
         LIMIT 50`,
        params
      );
      await conn.end();

      const rows = chars.map((ch) => `
        <tr>
          <td><a href="/armory/${realm.key}/${ch.guid}">${esc(ch.name)}</a></td>
          <td>${esc(ch.guid)}</td>
          <td>${esc(ch.account)}</td>
          <td>${esc(ch.level)}</td>
          <td>${esc(raceName(ch.race))}</td>
          <td>${esc(className(ch.class))}</td>
          <td>${ch.online ? "Online" : "Offline"}</td>
        </tr>
      `).join("");

      cards.push(`
        <div class="card">
          <h3>${esc(realm.name)}</h3>
          <p class="muted">Showing character GUIDs, account IDs, and links to exact item IDs.</p>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Name</th><th>GUID</th><th>Account</th><th>Level</th><th>Race</th><th>Class</th><th>Status</th></tr></thead>
              <tbody>${rows || `<tr><td colspan="7">No characters found.</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      `);
    }

    render(req, res, "Armory", `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">FrozenThrone Database</p>
            <h1>Characters</h1>
            <p>Browse player profiles, gear, race, class, level, and online status.</p>
          </div>
          <div class="card form">
            <form method="GET" action="/armory/characters">
              <label>Search Character Name</label>
              <input name="search" value="${esc(search)}" placeholder="Frozen, Noodle, Zara...">
              <button class="btn" type="submit">Search Armory</button>
            </form>
          </div>
          <div class="grid">${cards.join("")}</div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error(err);
    render(req, res, "Armory Error", errorCard("Armory failed to load. Check website.log for the SQL error."));
  }
});


app.get("/armory/items", async (req, res) => {
  const q = String(req.query.q || "").trim();

  try {
    const conn = await worldDb();
    let rows = [];

    if (q) {
      if (/^\d+$/.test(q)) {
        const [found] = await conn.execute(
          `SELECT entry, name, Quality, ItemLevel, RequiredLevel, class, subclass, displayid
           FROM item_template WHERE entry = ? LIMIT 100`,
          [Number(q)]
        );
        rows = found;
      } else {
        const [found] = await conn.execute(
          `SELECT entry, name, Quality, ItemLevel, RequiredLevel, class, subclass, displayid
           FROM item_template WHERE name LIKE ?
           ORDER BY ItemLevel DESC, entry ASC LIMIT 100`,
          [`%${q}%`]
        );
        rows = found;
      }
    }

    await conn.end();

    const resultRows = rows.map(i => `
      <tr>
        <td><img class="item-icon" src="${itemIconUrl(i.displayid)}" alt=""> <strong>${esc(i.name)}</strong></td>
        <td>${esc(i.entry)}</td>
        <td>${esc(i.ItemLevel)}</td>
        <td>${esc(i.RequiredLevel)}</td>
        <td>${esc(itemQualityName(i.Quality))}</td>
      </tr>
    `).join("");

    render(req, res, "Items Database", `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">FrozenThrone Database</p>
            <h1>Items</h1>
            <p>Search the full item database.</p>
          </div>

          <div class="card form">
            <form method="GET" action="/armory/items">
              <label>Item ID or Name</label>
              <input name="q" value="${esc(q)}" placeholder="Shadowmourne, Portable Hole, 900001">
              <button class="btn" type="submit">Search Items</button>
              <a class="btn secondary" href="/armory">Database Home</a>
            </form>
          </div>

          ${q ? `<div class="card"><h3>Results</h3><div class="table-wrap"><table class="data-table">
            <thead><tr><th>Item</th><th>Entry</th><th>iLvl</th><th>Req Level</th><th>Quality</th></tr></thead>
            <tbody>${resultRows || `<tr><td colspan="5">No items found.</td></tr>`}</tbody>
          </table></div></div>` : ""}
        </section>
      </main>
    `);
  } catch (err) {
    console.error("public item db failed", err);
    render(req, res, "Items Error", errorCard("Item database failed."));
  }
});

app.get("/armory/npcs", async (req, res) => {
  const q = String(req.query.q || "").trim();

  try {
    const conn = await worldDb();
    let rows = [];

    if (q) {
      if (/^\d+$/.test(q)) {
        const [found] = await conn.execute(
          `SELECT entry, name, subname, minlevel, maxlevel, npcflag, scale
           FROM creature_template WHERE entry = ? LIMIT 100`,
          [Number(q)]
        );
        rows = found;
      } else {
        const [found] = await conn.execute(
          `SELECT entry, name, subname, minlevel, maxlevel, npcflag, scale
           FROM creature_template WHERE name LIKE ? OR subname LIKE ?
           ORDER BY entry ASC LIMIT 100`,
          [`%${q}%`, `%${q}%`]
        );
        rows = found;
      }
    }

    await conn.end();

    const resultRows = rows.map(n => `
      <tr>
        <td><strong>${esc(n.name)}</strong></td>
        <td>${esc(n.entry)}</td>
        <td>${esc(n.subname || "")}</td>
        <td>${esc(n.minlevel)}-${esc(n.maxlevel)}</td>
        <td>${esc(n.npcflag)}</td>
      </tr>
    `).join("");

    render(req, res, "NPC Database", `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">FrozenThrone Database</p>
            <h1>NPCs</h1>
            <p>Search NPCs, creatures, vendors, and quest givers.</p>
          </div>

          <div class="card form">
            <form method="GET" action="/armory/npcs">
              <label>NPC Entry or Name</label>
              <input name="q" value="${esc(q)}" placeholder="900100, Quartermaster, Lich King">
              <button class="btn" type="submit">Search NPCs</button>
              <a class="btn secondary" href="/armory">Database Home</a>
            </form>
          </div>

          ${q ? `<div class="card"><h3>Results</h3><div class="table-wrap"><table class="data-table">
            <thead><tr><th>Name</th><th>Entry</th><th>Subname</th><th>Level</th><th>NPC Flags</th></tr></thead>
            <tbody>${resultRows || `<tr><td colspan="5">No NPCs found.</td></tr>`}</tbody>
          </table></div></div>` : ""}
        </section>
      </main>
    `);
  } catch (err) {
    console.error("public npc db failed", err);
    render(req, res, "NPC Error", errorCard("NPC database failed."));
  }
});

app.get("/armory/quests", async (req, res) => {
  const q = String(req.query.q || "").trim();

  try {
    const conn = await worldDb();
    let rows = [];

    if (q) {
      if (/^\d+$/.test(q)) {
        const [found] = await conn.execute(
          `SELECT ID, LogTitle, QuestLevel, MinLevel, QuestSortID
           FROM quest_template WHERE ID = ? LIMIT 100`,
          [Number(q)]
        );
        rows = found;
      } else {
        const [found] = await conn.execute(
          `SELECT ID, LogTitle, QuestLevel, MinLevel, QuestSortID
           FROM quest_template WHERE LogTitle LIKE ?
           ORDER BY QuestLevel DESC, ID ASC LIMIT 100`,
          [`%${q}%`]
        );
        rows = found;
      }
    }

    await conn.end();

    const resultRows = rows.map(q => `
      <tr>
        <td><strong>${esc(q.LogTitle || "Untitled Quest")}</strong></td>
        <td>${esc(q.ID)}</td>
        <td>${esc(q.QuestLevel)}</td>
        <td>${esc(q.MinLevel)}</td>
        <td>${esc(q.QuestSortID)}</td>
      </tr>
    `).join("");

    render(req, res, "Quest Database", `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">FrozenThrone Database</p>
            <h1>Quests</h1>
            <p>Search quests, objectives, chains, and rewards.</p>
          </div>

          <div class="card form">
            <form method="GET" action="/armory/quests">
              <label>Quest ID or Title</label>
              <input name="q" value="${esc(q)}" placeholder="The Missing Diplomat, 54, Shadowmourne">
              <button class="btn" type="submit">Search Quests</button>
              <a class="btn secondary" href="/armory">Database Home</a>
            </form>
          </div>

          ${q ? `<div class="card"><h3>Results</h3><div class="table-wrap"><table class="data-table">
            <thead><tr><th>Quest</th><th>ID</th><th>Level</th><th>Min Level</th><th>Sort</th></tr></thead>
            <tbody>${resultRows || `<tr><td colspan="5">No quests found.</td></tr>`}</tbody>
          </table></div></div>` : ""}
        </section>
      </main>
    `);
  } catch (err) {
    console.error("public quest db failed", err);
    render(req, res, "Quest Error", errorCard("Quest database failed."));
  }
});


app.get("/armory/:realm/:guid", async (req, res) => {
  const realm = getRealm(req.params.realm);
  const guid = Number(req.params.guid);

  if (!realm || !Number.isInteger(guid) || guid <= 0) {
    return render(req, res, "Armory", errorCard("Invalid armory character request."));
  }

  try {
    const charConn = await characterDb(realm.db);
    const itemConn = await worldDb();

    const [chars] = await charConn.execute(
      `SELECT guid, account, name, race, class, gender, level, xp, money, online, totalKills, todayKills, zone, map
       FROM characters
       WHERE guid = ? AND (deleteDate IS NULL OR deleteDate = 0)
       LIMIT 1`,
      [guid]
    );

    if (!chars.length) {
      await charConn.end();
      await itemConn.end();
      return render(req, res, "Armory", errorCard("Character not found."));
    }

    const ch = chars[0];

    const [equipped] = await charConn.execute(
      `SELECT ci.slot, ci.item AS itemGuid, ii.itemEntry, ii.count, ii.durability, ii.randomPropertyId, ii.enchantments
       FROM character_inventory ci
       JOIN item_instance ii ON ii.guid = ci.item
       WHERE ci.guid = ? AND ci.bag = 0 AND ci.slot BETWEEN 0 AND 18
       ORDER BY ci.slot ASC`,
      [guid]
    );

    const [bags] = await charConn.execute(
      `SELECT ci.bag, ci.slot, ci.item AS itemGuid, ii.itemEntry, ii.count, ii.durability, ii.randomPropertyId
       FROM character_inventory ci
       JOIN item_instance ii ON ii.guid = ci.item
       WHERE ci.guid = ? AND NOT (ci.bag = 0 AND ci.slot BETWEEN 0 AND 18)
       ORDER BY ci.bag ASC, ci.slot ASC
       LIMIT 120`,
      [guid]
    );

    let guildName = "";
    try {
      const [guilds] = await charConn.execute(
        `SELECT g.name
         FROM guild_member gm
         JOIN guild g ON g.guildid = gm.guildid
         WHERE gm.guid = ?
         LIMIT 1`,
        [guid]
      );
      guildName = guilds[0]?.name || "";
    } catch {}

    const [achievements] = await charConn.execute(
      `SELECT achievement, date
       FROM character_achievement
       WHERE guid = ?
       ORDER BY date DESC
       LIMIT 50`,
      [guid]
    );

    const allEntries = [...new Set([...equipped, ...bags].map(i => i.itemEntry).filter(Boolean))];
    let templates = new Map();

    if (allEntries.length) {
      const placeholders = allEntries.map(() => "?").join(",");
      const [items] = await itemConn.execute(
        `SELECT entry, name, Quality, ItemLevel, RequiredLevel, InventoryType, class, subclass, displayid
         FROM item_template
         WHERE entry IN (${placeholders})`,
        allEntries
      );
      templates = new Map(items.map(item => [Number(item.entry), item]));
    }

    await charConn.end();
    await itemConn.end();

    const gearBySlot = new Map(equipped.map(g => [Number(g.slot), g]));
    const avgItems = equipped.map(g => templates.get(Number(g.itemEntry))).filter(t => t && Number(t.ItemLevel) > 0);
    const avgIlvl = avgItems.length ? Math.round(avgItems.reduce((a, t) => a + Number(t.ItemLevel || 0), 0) / avgItems.length) : 0;

    const raceKey = raceName(ch.race).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const genderKey = Number(ch.gender) === 1 ? "female" : "male";
    const classKey = className(ch.class).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const modelImage = `/images/armory/models/character-${ch.guid}.png`;
    const fallbackModelImage = `/images/armory/models/${raceKey}-${genderKey}-${classKey}.svg`;
    const portraitImage = `/images/armory/portraits/character-${ch.guid}.png`;
    const fallbackPortraitImage = `/images/armory/portraits/${raceKey}-${genderKey}-${classKey}.svg`;

    const slotIcon = (slot, label) => {
      const gear = gearBySlot.get(slot);
      const tpl = gear ? (templates.get(Number(gear.itemEntry)) || {}) : {};
      const q = Number(tpl.Quality ?? 0);

      if (!gear) {
        return `
          <div class="ftslot empty">
            <div class="ftslot-icon">?</div>
            <span>${esc(label)}</span>
          </div>
        `;
      }

      return `
        <a class="ftslot q${q}" href="/armory/items?q=${gear.itemEntry}">
          <img src="${itemIconUrl(tpl.displayid)}" alt="">
          <span>${esc(label)}</span>
          <div class="fttip q${q}">
            <strong>${esc(tpl.name || "Unknown Item")}</strong>
            <small>${esc(itemQualityName(tpl.Quality))}</small>
            <small>Item Level ${esc(tpl.ItemLevel || "")}</small>
            <small>Entry ${esc(gear.itemEntry)}</small>
            <small class="gm-command">.additem ${esc(gear.itemEntry)}</small>
          </div>
        </a>
      `;
    };

    const bagRows = bags.slice(0, 80).map(item => {
      const tpl = templates.get(Number(item.itemEntry)) || {};
      return `
        <tr>
          <td><img class="item-icon" src="${itemIconUrl(tpl.displayid)}" alt=""> <strong>${esc(tpl.name || "Unknown Item")}</strong></td>
          <td>${esc(item.itemEntry)}</td>
          <td>${esc(item.count)}</td>
          <td>${esc(itemQualityName(tpl.Quality))}</td>
        </tr>
      `;
    }).join("");

    const achievementRows = achievements.map(a => {
      const earned = a.date ? new Date(Number(a.date) * 1000).toLocaleString("en-US") : "Unknown";
      return `
        <tr>
          <td><strong>Achievement #${esc(a.achievement)}</strong></td>
          <td>${esc(earned)}</td>
        </tr>
      `;
    }).join("");

    render(req, res, `${ch.name} Character Profile`, `
      <main class="container ftcharv2-page">
        <section class="ftcharv2">

          <div class="ftcharv2-head">
            <div class="ftcharv2-title">
              <h1>${esc(ch.name)}</h1>
              <p>${esc(realm.name)} · Level ${esc(ch.level)} ${esc(raceName(ch.race))} ${esc(className(ch.class))}${guildName ? ` · ${esc(guildName)}` : ""}</p>
            </div>
            <div class="ftcharv2-status ${ch.online ? "on" : "off"}">${ch.online ? "Online" : "Offline"}</div>
          </div>

          <div class="ftcharv2-main">
            <aside class="ftcharv2-gear">
              <h3>Equipment</h3>
              ${slotIcon(0, "Head")}
              ${slotIcon(1, "Neck")}
              ${slotIcon(2, "Shoulder")}
              ${slotIcon(14, "Back")}
              ${slotIcon(4, "Chest")}
              ${slotIcon(8, "Wrist")}
              ${slotIcon(9, "Hands")}
              ${slotIcon(5, "Waist")}
              ${slotIcon(6, "Legs")}
              ${slotIcon(7, "Feet")}
              ${slotIcon(10, "Ring")}
              ${slotIcon(11, "Ring")}
              ${slotIcon(12, "Trinket")}
              ${slotIcon(13, "Trinket")}
              ${slotIcon(15, "Main Hand")}
              ${slotIcon(16, "Off Hand")}
              ${slotIcon(17, "Ranged")}
            </aside>

            <section class="ftcharv2-model">
              <div id="ftmodel_3d" class="ftmodel-viewer" data-realm="${esc(req.params.realm || "main")}" data-guid="${esc(ch.guid)}"></div>
              <div id="ftmodel-status" class="ftmodel-status">Loading 3D character...</div>
              <button id="ftmodel-reset" class="ftmodel-reset" type="button">Reset View</button>
            </section>

            <aside class="ftcharv2-info">
              <h3>Summary</h3>
              <div><span>Realm</span><strong>${esc(realm.name)}</strong></div>
              <div><span>Guild</span><strong>${guildName ? esc(guildName) : "None"}</strong></div>
              <div><span>Average Item Level</span><strong>${esc(avgIlvl)}</strong></div>
              <div><span>Gold</span><strong>${moneyToGold(ch.money)}</strong></div>
              <div><span>Total Kills</span><strong>${esc(ch.totalKills || 0)}</strong></div>
              <div><span>Today Kills</span><strong>${esc(ch.todayKills || 0)}</strong></div>
              <div><span>Zone</span><strong>${esc(ch.zone || 0)}</strong></div>
              <div><span>Map</span><strong>${esc(ch.map || 0)}</strong></div>
            </aside>
          </div>

          <div class="ftcharv2-tabs">
            <button class="active" data-tab="summary">Summary</button>
            <button data-tab="stats">Stats</button>
            <button data-tab="talents">Talents</button>
            <button data-tab="inventory">Inventory</button>
            <button data-tab="achievements">Achievements</button>
            <button data-tab="activity">Activity</button>
            <button data-tab="forums">Forums</button>
          </div>

          <div class="ftcharv2-panel active" id="tab-summary">
            <h3>Character Summary</h3>
            <p>${esc(ch.name)} is a level ${esc(ch.level)} ${esc(raceName(ch.race))} ${esc(className(ch.class))} on ${esc(realm.name)}.</p>
          </div>

          <div class="ftcharv2-panel" id="tab-stats">
            <h3>Stats</h3>
            <div class="ftcharv2-statgrid">
              <div><span>Level</span><strong>${esc(buildStats(ch).level)}</strong></div>
              <div><span>Health</span><strong>${esc(buildStats(ch).health)}</strong></div>
              <div><span>Mana</span><strong>${esc(buildStats(ch).power.mana)}</strong></div>
              <div><span>Rage</span><strong>${esc(buildStats(ch).power.rage)}</strong></div>
              <div><span>Energy</span><strong>${esc(buildStats(ch).power.energy)}</strong></div>
              <div><span>Runic Power</span><strong>${esc(buildStats(ch).power.runicPower)}</strong></div>
              <div><span>XP</span><strong>${esc(buildStats(ch).xp)}</strong></div>
              <div><span>Total Kills</span><strong>${esc(buildStats(ch).kills.total)}</strong></div>
              <div><span>Today Kills</span><strong>${esc(buildStats(ch).kills.today)}</strong></div>
              <div><span>Money</span><strong>${esc(buildStats(ch).money)}</strong></div>
              <div><span>Map</span><strong>${esc(buildStats(ch).location.map)}</strong></div>
              <div><span>Zone</span><strong>${esc(buildStats(ch).location.zone)}</strong></div>
              <div><span>Online</span><strong>${buildStats(ch).online ? "Yes" : "No"}</strong></div>
            </div>
          </div>

          <div class="ftcharv2-panel" id="tab-talents">
            <h3>Talents</h3>
            <p>Talent inspection will be added after we wire character talent tables.</p>
          </div>

          <div class="ftcharv2-panel" id="tab-inventory">
            <h3>Inventory</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Item</th><th>Entry</th><th>Count</th><th>Quality</th></tr></thead>
                <tbody>${bagRows || `<tr><td colspan="4">No bag items found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>

          <div class="ftcharv2-panel" id="tab-achievements">
            <h3>Achievements</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Achievement</th><th>Earned</th></tr></thead>
                <tbody>${achievementRows || `<tr><td colspan="2">No achievements found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>

          <div class="ftcharv2-panel" id="tab-activity">
            <h3>Activity</h3>
            <div class="ftcharv2-statgrid">
              <div><span>Online</span><strong>${ch.online ? "Yes" : "No"}</strong></div>
              <div><span>Total Kills</span><strong>${esc(ch.totalKills || 0)}</strong></div>
              <div><span>Today Kills</span><strong>${esc(ch.todayKills || 0)}</strong></div>
              <div><span>Zone</span><strong>${esc(ch.zone || 0)}</strong></div>
              <div><span>Map</span><strong>${esc(ch.map || 0)}</strong></div>
              <div><span>XP</span><strong>${esc(ch.xp || 0)}</strong></div>
            </div>
          </div>

          <div class="ftcharv2-panel" id="tab-forums">
            <h3>Forums</h3>
            <p>Forum posts, comments, bug reports, and player discussions will appear here once the community system is built.</p>
          </div>

          <a class="btn secondary" href="/armory/characters">Back to Characters</a>
        </section>
      </main>

<script src="https://code.jquery.com/jquery-3.5.1.min.js"></script>
<script src="/modelviewer/live/viewer/viewer.min.js"></script>
<script type="module">
  import { generateModels, findItemsInEquipments } from "/vendor/wow-model-viewer/index.js?v=chestfix1";

  window.CONTENT_PATH = "/modelviewer/live/";
  window.WOTLK_TO_RETAIL_DISPLAY_ID_API = "/wotlk-items";

  const box = document.getElementById("ftmodel_3d");
  const status = document.getElementById("ftmodel-status");

  async function loadFrozenThroneModel() {
    try {
      const realm = box.dataset.realm || "main";
      const guid = box.dataset.guid;
      const character = await fetch("/api/armory-viewer/" + realm + "/" + guid).then(r => r.json());

      if (character.equipments) character.items = await findItemsInEquipments(character.equipments);

      const viewer = await generateModels(1.25, "#ftmodel_3d", character, "live");
      box.classList.add("loaded");
      window.ftArmoryViewer = viewer;

      function setFrozenView() {
        viewer.setDistance(4.15);
        viewer.setAzimuth(0);
        viewer.setZenith(1.28);
      }

      setFrozenView();
      document.getElementById("ftmodel-reset")?.addEventListener("click", setFrozenView);
      setInterval(() => { try { viewer.setZenith(1.28); } catch(e) {} }, 300);
      status.textContent = "";
    } catch (err) {
      console.error(err);
      status.textContent = "3D character failed to load.";
    }
  }

  document.querySelectorAll(".ftcharv2-tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ftcharv2-tabs button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".ftcharv2-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  loadFrozenThroneModel();
</script>
    `);
  } catch (err) {
    console.error(err);
    render(req, res, "Armory Error", errorCard("Armory character page failed. Check website.log for the SQL error."));
  }
});

};
