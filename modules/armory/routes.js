const { buildStats } = require("./engine/stats");
const { loadCharacterView } = require("./repositories/characterViewRepository");
const { buildCharacterProfileView } = require("./services/characterViewService");
const { renderCharacterV3 } = require("./renderers/characterV3Renderer");
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

  function databaseTabs(active = "characters") {
    const tabs = [
      ["characters", "Characters", "/armory/characters"],
      ["items", "Items", "/armory/items"],
      ["npcs", "NPCs", "/armory/npcs"],
      ["quests", "Quests", "/armory/quests"],
      ["spells", "Spells", "/armory/spells"],
      ["mounts", "Mounts", "/armory/mounts"],
      ["titles", "Titles", "/armory/titles"],
      ["achievements", "Achievements", "/armory/achievements"]
    ];

    return `<div class="ft-tabs">${tabs.map(([key, label, href]) =>
      `<a class="${active === key ? "active" : ""}" href="${href}">${label}</a>`
    ).join("")}</div>`;
  }

  function databaseFrame(active, title, description, content) {
    return `
      <main class="ft-shell database-page">
        <section class="ft-frame">
          <div class="ft-head">
            <p class="eyebrow">FrozenThrone Database</p>
            <h1>${esc(title)}</h1>
            <p>${esc(description)}</p>
          </div>
          ${databaseTabs(active)}
          <div class="ft-panel">${content}</div>
        </section>
      </main>
    `;
  }


app.get("/armory", (req, res, next) => {

  if (req.query.tab === "characters") return res.redirect("/armory/characters");

  return next();

});

app.get(["/armory", "/database"], async (req, res) => {
  if (req.query.tab === "characters") return res.redirect("/armory/characters");
  return res.redirect("/armory/characters");
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

    render(req, res, "Characters Database", databaseFrame(
      "characters",
      "Characters",
      "Browse player profiles, gear, race, class, level, and online status.",
      `
        <form class="ft-search" method="GET" action="/armory/characters">
          <div>
            <label>Search Character Name</label><br>
            <input name="search" value="${esc(search)}" placeholder="Frozen, Noodle, Zara...">
          </div>
          <button class="ft-btn" type="submit">Search</button>
        </form>
        <div class="database-results">${cards.join("")}</div>
      `
    ));
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
        [rows] = await conn.execute(
          `SELECT entry, name, Quality, ItemLevel, RequiredLevel, InventoryType, displayid
           FROM item_template WHERE entry = ? LIMIT 100`,
          [Number(q)]
        );
      } else {
        [rows] = await conn.execute(
          `SELECT entry, name, Quality, ItemLevel, RequiredLevel, InventoryType, displayid
           FROM item_template WHERE name LIKE ?
           ORDER BY ItemLevel DESC, entry ASC LIMIT 100`,
          [`%${q}%`]
        );
      }
    } else {
      [rows] = await conn.execute(
        `SELECT entry, name, Quality, ItemLevel, RequiredLevel, InventoryType, displayid
         FROM item_template ORDER BY ItemLevel DESC, entry ASC LIMIT 100`
      );
    }

    await conn.end();

    const resultRows = rows.map(i => `
      <tr>
        <td><a href="/armory/item/${esc(i.entry)}"><img class="item-icon" src="${itemIconUrl(i.displayid)}" alt=""> <strong>${esc(i.name)}</strong></a></td>
        <td>${esc(i.entry)}</td>
        <td>${esc(i.ItemLevel || 0)}</td>
        <td>${esc(i.RequiredLevel || 0)}</td>
        <td>${esc(itemQualityName(i.Quality))}</td>
        <td>${esc(i.InventoryType || "")}</td>
      </tr>
    `).join("");

    render(req, res, "Items Database", databaseFrame("items", "Items", "Browse weapons, armor, bags, consumables, custom items, vendors, drops, and ownership.", `
      <form class="ft-search" method="GET" action="/armory/items">
        <div><label>Search Item</label><br><input name="q" value="${esc(q)}" placeholder="Shadowmourne, Portable Hole, 900001"></div>
        <button class="ft-btn" type="submit">Search</button>
        <a class="ft-btn secondary" href="/armory/items">Reset</a>
      </form>
      <div class="database-results"><div class="card"><h3>${q ? "Results" : "Top Items"}</h3><div class="table-wrap"><table class="data-table">
        <thead><tr><th>Item</th><th>Entry</th><th>iLvl</th><th>Req</th><th>Quality</th><th>Slot</th></tr></thead>
        <tbody>${resultRows || `<tr><td colspan="6">No items found.</td></tr>`}</tbody>
      </table></div></div></div>
    `));
  } catch (err) {
    console.error("items table failed", err);
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
        [rows] = await conn.execute(
          `SELECT entry, name, subname, minlevel, maxlevel, npcflag, scale
           FROM creature_template WHERE entry = ? LIMIT 100`,
          [Number(q)]
        );
      } else {
        [rows] = await conn.execute(
          `SELECT entry, name, subname, minlevel, maxlevel, npcflag, scale
           FROM creature_template WHERE name LIKE ? OR subname LIKE ?
           ORDER BY entry ASC LIMIT 100`,
          [`%${q}%`, `%${q}%`]
        );
      }
    } else {
      [rows] = await conn.execute(
        `SELECT entry, name, subname, minlevel, maxlevel, npcflag, scale
         FROM creature_template ORDER BY entry ASC LIMIT 100`
      );
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

    render(req, res, "NPC Database", databaseFrame("npcs", "NPCs", "Search NPCs, creatures, vendors, trainers, and quest givers.", `
      <form class="ft-search" method="GET" action="/armory/npcs">
        <div><label>NPC Entry or Name</label><br><input name="q" value="${esc(q)}" placeholder="900100, Quartermaster, Lich King"></div>
        <button class="ft-btn" type="submit">Search</button>
        <a class="ft-btn secondary" href="/armory/npcs">Reset</a>
      </form>
      <div class="database-results"><div class="card"><h3>${q ? "Results" : "NPCs"}</h3><div class="table-wrap"><table class="data-table">
        <thead><tr><th>Name</th><th>Entry</th><th>Subname</th><th>Level</th><th>NPC Flags</th></tr></thead>
        <tbody>${resultRows || `<tr><td colspan="5">No NPCs found.</td></tr>`}</tbody>
      </table></div></div></div>
    `));
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
        [rows] = await conn.execute(
          `SELECT ID, LogTitle, QuestLevel, MinLevel, QuestSortID
           FROM quest_template WHERE ID = ? LIMIT 100`,
          [Number(q)]
        );
      } else {
        [rows] = await conn.execute(
          `SELECT ID, LogTitle, QuestLevel, MinLevel, QuestSortID
           FROM quest_template WHERE LogTitle LIKE ?
           ORDER BY QuestLevel DESC, ID ASC LIMIT 100`,
          [`%${q}%`]
        );
      }
    } else {
      [rows] = await conn.execute(
        `SELECT ID, LogTitle, QuestLevel, MinLevel, QuestSortID
         FROM quest_template ORDER BY ID ASC LIMIT 100`
      );
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

    render(req, res, "Quest Database", databaseFrame("quests", "Quests", "Search quests, objectives, chains, rewards, starters, and enders.", `
      <form class="ft-search" method="GET" action="/armory/quests">
        <div><label>Quest ID or Title</label><br><input name="q" value="${esc(q)}" placeholder="The Missing Diplomat, 54, Shadowmourne"></div>
        <button class="ft-btn" type="submit">Search</button>
        <a class="ft-btn secondary" href="/armory/quests">Reset</a>
      </form>
      <div class="database-results"><div class="card"><h3>${q ? "Results" : "Quests"}</h3><div class="table-wrap"><table class="data-table">
        <thead><tr><th>Quest</th><th>ID</th><th>Level</th><th>Min Level</th><th>Sort</th></tr></thead>
        <tbody>${resultRows || `<tr><td colspan="5">No quests found.</td></tr>`}</tbody>
      </table></div></div></div>
    `));
  } catch (err) {
    console.error("public quest db failed", err);
    render(req, res, "Quest Error", errorCard("Quest database failed."));
  }
});


app.get("/armory/spells", async (req, res) => {
  const q = String(req.query.q || "").trim();

  try {
    const conn = await worldDb();
    let rows = [];

    if (q && /^\d+$/.test(q)) {
      [rows] = await conn.execute(
        `SELECT Id AS ID, SpellName AS name, SpellLevel, BaseLevel, SchoolMask, DmgClass
         FROM spell_dbc
         WHERE Id = ?
         LIMIT 100`,
        [Number(q)]
      );
    } else if (q) {
      [rows] = await conn.execute(
        `SELECT Id AS ID, SpellName AS name, SpellLevel, BaseLevel, SchoolMask, DmgClass
         FROM spell_dbc
         WHERE SpellName LIKE ?
         ORDER BY ID ASC
         LIMIT 100`,
        [`%${q}%`]
      );
    } else {
      [rows] = await conn.execute(
        `SELECT Id AS ID, SpellName AS name, SpellLevel, BaseLevel, SchoolMask, DmgClass
         FROM spell_dbc
         WHERE SpellName IS NOT NULL AND SpellName <> ''
         ORDER BY ID ASC
         LIMIT 100`
      );
    }

    await conn.end();

    const resultRows = rows.map(sp => `
      <tr>
        <td><strong>${esc(sp.name || "Unnamed Spell")}</strong></td>
        <td>${esc(sp.ID)}</td>
        <td>${esc(sp.SpellLevel || 0)}</td>
        <td>${esc(sp.BaseLevel || 0)}</td>
        <td>${esc(sp.SchoolMask || 0)}</td>
      </tr>
    `).join("");

    render(req, res, "Spell Database", databaseFrame("spells", "Spells", "Search spell IDs, names, and ranks from the Wrath database.", `
      <form class="ft-search" method="GET" action="/armory/spells">
        <div><label>Spell ID or Name</label><br><input name="q" value="${esc(q)}" placeholder="Fireball, Death Coil, 49998"></div>
        <button class="ft-btn" type="submit">Search</button>
        <a class="ft-btn secondary" href="/armory/spells">Reset</a>
      </form>
      <div class="database-results"><div class="card"><h3>${q ? "Results" : "Spells"}</h3><div class="table-wrap"><table class="data-table">
        <thead><tr><th>Spell</th><th>ID</th><th>Spell Level</th><th>Base Level</th><th>School</th></tr></thead>
        <tbody>${resultRows || `<tr><td colspan="5">No spells found.</td></tr>`}</tbody>
      </table></div></div></div>
    `));
  } catch (err) {
    console.error("public spell db failed", err);
    render(req, res, "Spell Error", errorCard("Spell database failed. spell_dbc may be missing or named differently."));
  }
});

app.get("/armory/mounts", async (req, res) => {
  const q = String(req.query.q || "").trim();

  try {
    const conn = await worldDb();
    let rows = [];

    if (q && /^\d+$/.test(q)) {
      [rows] = await conn.execute(
        `SELECT entry, name, Quality, ItemLevel, RequiredLevel, displayid
         FROM item_template
         WHERE entry = ? AND (class = 15 OR name LIKE '%Mount%' OR name LIKE '%Steed%' OR name LIKE '%Drake%' OR name LIKE '%Tiger%' OR name LIKE '%Horse%')
         LIMIT 100`,
        [Number(q)]
      );
    } else if (q) {
      [rows] = await conn.execute(
        `SELECT entry, name, Quality, ItemLevel, RequiredLevel, displayid
         FROM item_template
         WHERE (name LIKE ?)
           AND (class = 15 OR name LIKE '%Mount%' OR name LIKE '%Steed%' OR name LIKE '%Drake%' OR name LIKE '%Tiger%' OR name LIKE '%Horse%')
         ORDER BY ItemLevel DESC, entry ASC
         LIMIT 100`,
        [`%${q}%`]
      );
    } else {
      [rows] = await conn.execute(
        `SELECT entry, name, Quality, ItemLevel, RequiredLevel, displayid
         FROM item_template
         WHERE class = 15
            OR name LIKE '%Mount%'
            OR name LIKE '%Steed%'
            OR name LIKE '%Drake%'
            OR name LIKE '%Tiger%'
            OR name LIKE '%Horse%'
         ORDER BY entry ASC
         LIMIT 100`
      );
    }

    await conn.end();

    const resultRows = rows.map(m => `
      <tr>
        <td><img class="item-icon" src="${itemIconUrl(m.displayid)}" alt=""> <strong>${esc(m.name || "Unnamed Mount")}</strong></td>
        <td>${esc(m.entry)}</td>
        <td>${esc(itemQualityName(m.Quality))}</td>
        <td>${esc(m.ItemLevel || 0)}</td>
        <td>${esc(m.RequiredLevel || 0)}</td>
      </tr>
    `).join("");

    render(req, res, "Mount Database", databaseFrame("mounts", "Mounts", "Browse mount items and searchable ride rewards from item_template.", `
      <form class="ft-search" method="GET" action="/armory/mounts">
        <div><label>Mount Item ID or Name</label><br><input name="q" value="${esc(q)}" placeholder="Invincible, Drake, Horse, 50818"></div>
        <button class="ft-btn" type="submit">Search</button>
        <a class="ft-btn secondary" href="/armory/mounts">Reset</a>
      </form>
      <div class="database-results"><div class="card"><h3>${q ? "Results" : "Mounts"}</h3><div class="table-wrap"><table class="data-table">
        <thead><tr><th>Mount</th><th>Entry</th><th>Quality</th><th>iLvl</th><th>Req</th></tr></thead>
        <tbody>${resultRows || `<tr><td colspan="5">No mounts found.</td></tr>`}</tbody>
      </table></div></div></div>
    `));
  } catch (err) {
    console.error("public mount db failed", err);
    render(req, res, "Mount Error", errorCard("Mount database failed."));
  }
});



app.get("/armory/achievements", async (req, res) => {
  const q = String(req.query.q || "").trim();

  try {
    const conn = await worldDb();
    let rows = [];

    if (q && /^\d+$/.test(q)) {
      [rows] = await conn.execute(
        `SELECT ID, points, mapID, requiredFaction, flags, count, refAchievement
         FROM achievement_dbc
         WHERE ID = ?
         LIMIT 100`,
        [Number(q)]
      );
    } else {
      [rows] = await conn.execute(
        `SELECT ID, points, mapID, requiredFaction, flags, count, refAchievement
         FROM achievement_dbc
         ORDER BY ID ASC
         LIMIT 100`
      );
    }

    await conn.end();

    const resultRows = rows.map(a => `
      <tr>
        <td><strong>Achievement #${esc(a.ID)}</strong></td>
        <td>${esc(a.ID)}</td>
        <td>${esc(a.points || 0)}</td>
        <td>${esc(a.mapID)}</td>
        <td>${esc(a.requiredFaction)}</td>
        <td>${esc(a.count || 0)}</td>
      </tr>
    `).join("");

    render(req, res, "Achievement Database", databaseFrame("achievements", "Achievements", "Browse achievement IDs, points, maps, factions, and counters.", `
      <form class="ft-search" method="GET" action="/armory/achievements">
        <div><label>Achievement ID</label><br><input name="q" value="${esc(q)}" placeholder="6, 13, 2144"></div>
        <button class="ft-btn" type="submit">Search</button>
        <a class="ft-btn secondary" href="/armory/achievements">Reset</a>
      </form>
      <div class="database-results"><div class="card"><h3>${q ? "Results" : "Achievements"}</h3><div class="table-wrap"><table class="data-table">
        <thead><tr><th>Achievement</th><th>ID</th><th>Points</th><th>Map</th><th>Faction</th><th>Count</th></tr></thead>
        <tbody>${resultRows || `<tr><td colspan="6">No achievements found.</td></tr>`}</tbody>
      </table></div></div></div>
    `));
  } catch (err) {
    console.error("public achievement db failed", err);
    render(req, res, "Achievement Error", errorCard("Achievement database failed."));
  }
});



app.get("/armory/titles", async (req, res) => {
  const q = String(req.query.q || "").trim();

  try {
    const conn = await worldDb();
    let rows = [];

    if (q && /^\d+$/.test(q)) {
      [rows] = await conn.execute(
        `SELECT alliance_id, horde_id
         FROM player_factionchange_titles
         WHERE alliance_id = ? OR horde_id = ?
         ORDER BY alliance_id ASC
         LIMIT 100`,
        [Number(q), Number(q)]
      );
    } else {
      [rows] = await conn.execute(
        `SELECT alliance_id, horde_id
         FROM player_factionchange_titles
         ORDER BY alliance_id ASC
         LIMIT 100`
      );
    }

    await conn.end();

    const resultRows = rows.map(t => `
      <tr>
        <td><strong>Alliance Title #${esc(t.alliance_id)}</strong></td>
        <td>${esc(t.alliance_id)}</td>
        <td><strong>Horde Title #${esc(t.horde_id)}</strong></td>
        <td>${esc(t.horde_id)}</td>
      </tr>
    `).join("");

    render(req, res, "Title Database", databaseFrame("titles", "Titles", "Browse faction-change title mappings from your current world database.", `
      <form class="ft-search" method="GET" action="/armory/titles">
        <div><label>Title ID</label><br><input name="q" value="${esc(q)}" placeholder="1, 15, 28"></div>
        <button class="ft-btn" type="submit">Search</button>
        <a class="ft-btn secondary" href="/armory/titles">Reset</a>
      </form>
      <div class="database-results"><div class="card"><h3>${q ? "Results" : "Title Mappings"}</h3><div class="table-wrap"><table class="data-table">
        <thead><tr><th>Alliance Title</th><th>Alliance ID</th><th>Horde Title</th><th>Horde ID</th></tr></thead>
        <tbody>${resultRows || `<tr><td colspan="4">No titles found.</td></tr>`}</tbody>
      </table></div></div></div>
    `));
  } catch (err) {
    console.error("public title db failed", err);
    render(req, res, "Title Error", errorCard("Title database failed."));
  }
});


app.get("/armory/:realm/:guid", async (req, res) => {
  const realm = getRealm(req.params.realm);
  const guid = Number(req.params.guid);

  if (!realm || !Number.isInteger(guid) || guid <= 0) {
    return render(req, res, "Character Database", errorCard("Invalid character database request."));
  }

  let charConn;
  let worldConn;

  try {
    charConn = await characterDb(realm.db);
    worldConn = await worldDb();

    const data = await loadCharacterView(charConn, worldConn, guid);

    if (!data || !data.character) {
      return render(req, res, "Character Database", errorCard("Character not found."));
    }

    const view = buildCharacterProfileView(data.character, {
      equipped: data.equipped,
      inventory: data.inventory,
      helpers: { raceName, className }
    });

    view.guild = data.guild || null;
    view.realm = realm;
    view.images = view.images || {};
    view.images.realm = realm.key;
    view.images.guid = guid;
    view.images.manifestUrl = `/api/armory-viewer/${realm.key}/${guid}`;

    render(req, res, `${data.character.name} - FrozenThrone Character Database`, renderCharacterV3(view));
  } catch (err) {
    console.error("Armory V3 character route failed", err);
    render(req, res, "Character Database Error", errorCard("Character database page failed. Check website.log for details."));
  } finally {
    try { if (charConn) await charConn.end(); } catch {}
    try { if (worldConn) await worldConn.end(); } catch {}
  }
});

};
