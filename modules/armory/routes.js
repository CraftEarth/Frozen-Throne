const { buildStats } = require("./engine/stats");
const { getTitleName } = require("../dbc/titles");
const { getAchievementName, getAchievement } = require("../dbc/achievements");
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

    return `<div class="ft-section-tabs">${tabs.map(([key, label, href]) =>
      `<a class="${active === key ? "active" : ""}" href="${href}">${label}</a>`
    ).join("")}</div>`;
  }

  function databaseFrame(active, title, description, content) {
    return `
      <main class="ft-shell database-page">
        <section class="ft-frame">
          <div class="ft-db-head">
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
        <td><a href="/armory/npc/${esc(n.entry)}"><strong>${esc(n.name)}</strong></a></td>
        <td><a href="/armory/npc/${esc(n.entry)}">${esc(n.entry)}</a></td>
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
        <td><a href="/armory/quest/${esc(q.ID)}"><strong>${esc(q.LogTitle || "Untitled Quest")}</strong></a></td>
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



app.get("/armory/quest/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return render(req, res, "Quest Database", errorCard("Invalid quest ID."));
  }

  try {
    const conn = await worldDb();

    const [rows] = await conn.execute(
      `SELECT *
       FROM quest_template
       WHERE ID = ?
       LIMIT 1`,
      [id]
    );

    await conn.end();

    if (!rows.length) {
      return render(req, res, "Quest Database", errorCard("Quest not found."));
    }

    const q = rows[0];

    render(req, res, `${q.LogTitle || "Quest"} - Quest Database`, databaseFrame("quests", q.LogTitle || "Quest", `Quest ID ${q.ID} · Level ${q.QuestLevel || 0} · Min Level ${q.MinLevel || 0}`, `
      <div class="card item-detail-hero">
        <h2>${esc(q.LogTitle || "Untitled Quest")}</h2>
        <p class="muted">Quest ID ${esc(q.ID)} · Level ${esc(q.QuestLevel || 0)} · Min Level ${esc(q.MinLevel || 0)}</p>
        <a class="ft-btn secondary" href="/armory/quests">Back to Quests</a>
      </div>

      <div class="grid grid-4">
        <div class="card stat"><span>ID</span><strong>${esc(q.ID)}</strong></div>
        <div class="card stat"><span>Quest Level</span><strong>${esc(q.QuestLevel || 0)}</strong></div>
        <div class="card stat"><span>Min Level</span><strong>${esc(q.MinLevel || 0)}</strong></div>
        <div class="card stat"><span>Sort</span><strong>${esc(q.QuestSortID || 0)}</strong></div>
      </div>

      <div class="card">
        <h3>📜 Quest Details</h3>
        <div class="table-wrap">
          <table class="data-table">
            <tbody>
              <tr><td>Type</td><td>${esc(q.QuestType || 0)}</td></tr>
              <tr><td>Flags</td><td>${esc(q.Flags || 0)}</td></tr>
              <tr><td>Reward XP</td><td>${esc(q.RewardXPDifficulty || 0)}</td></tr>
              <tr><td>Reward Money</td><td>${esc(q.RewardMoney || 0)}</td></tr>
              <tr><td>Reward Bonus Money</td><td>${esc(q.RewardBonusMoney || 0)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h3>Objective / Text</h3>
        <p class="muted">${esc(q.QuestDescription || q.LogDescription || q.QuestCompletionLog || "No quest text found in this database row.")}</p>
      </div>
    `));
  } catch (err) {
    console.error("public quest detail failed", err);
    render(req, res, "Quest Error", errorCard("Quest detail page failed."));
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
        <td><a href="/armory/spell/${esc(sp.ID)}"><strong>${esc(sp.name || "Unnamed Spell")}</strong></a></td>
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


app.get("/armory/spell/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return render(req, res, "Spell Database", errorCard("Invalid spell ID."));
  }

  try {
    const conn = await worldDb();

    const [rows] = await conn.execute(
      `SELECT *
       FROM spell_dbc
       WHERE Id = ?
       LIMIT 1`,
      [id]
    );

    await conn.end();

    if (!rows.length) {
      return render(req, res, "Spell Database", errorCard("Spell not found."));
    }

    const sp = rows[0];

    render(req, res, `${sp.SpellName || "Spell"} - Spell Database`, databaseFrame("spells", sp.SpellName || "Spell", `Spell ID ${sp.Id} · Spell Level ${sp.SpellLevel || 0} · Base Level ${sp.BaseLevel || 0}`, `
      <div class="card item-detail-hero">
        <h2>${esc(sp.SpellName || "Unnamed Spell")}</h2>
        <p class="muted">Spell ID ${esc(sp.Id)} · Spell Level ${esc(sp.SpellLevel || 0)} · Base Level ${esc(sp.BaseLevel || 0)}</p>
        <a class="ft-btn secondary" href="/armory/spells">Back to Spells</a>
      </div>

      <div class="grid grid-4">
        <div class="card stat"><span>ID</span><strong>${esc(sp.Id)}</strong></div>
        <div class="card stat"><span>Spell Level</span><strong>${esc(sp.SpellLevel || 0)}</strong></div>
        <div class="card stat"><span>Base Level</span><strong>${esc(sp.BaseLevel || 0)}</strong></div>
        <div class="card stat"><span>School</span><strong>${esc(sp.SchoolMask || 0)}</strong></div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h3>✨ Spell Info</h3>
          <div class="table-wrap">
            <table class="data-table">
              <tbody>
                <tr><td>Dispel</td><td>${esc(sp.Dispel || 0)}</td></tr>
                <tr><td>Mechanic</td><td>${esc(sp.Mechanic || 0)}</td></tr>
                <tr><td>Range Index</td><td>${esc(sp.RangeIndex || 0)}</td></tr>
                <tr><td>Duration Index</td><td>${esc(sp.DurationIndex || 0)}</td></tr>
                <tr><td>Max Level</td><td>${esc(sp.MaxLevel || 0)}</td></tr>
                <tr><td>Damage Class</td><td>${esc(sp.DmgClass || 0)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h3>⚔ Effects</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>#</th><th>Effect</th><th>Base Points</th><th>Aura</th><th>Trigger Spell</th></tr></thead>
              <tbody>
                <tr><td>1</td><td>${esc(sp.Effect1 || 0)}</td><td>${esc(sp.EffectBasePoints1 || 0)}</td><td>${esc(sp.EffectApplyAuraName1 || 0)}</td><td>${esc(sp.EffectTriggerSpell1 || 0)}</td></tr>
                <tr><td>2</td><td>${esc(sp.Effect2 || 0)}</td><td>${esc(sp.EffectBasePoints2 || 0)}</td><td>${esc(sp.EffectApplyAuraName2 || 0)}</td><td>${esc(sp.EffectTriggerSpell2 || 0)}</td></tr>
                <tr><td>3</td><td>${esc(sp.Effect3 || 0)}</td><td>${esc(sp.EffectBasePoints3 || 0)}</td><td>${esc(sp.EffectApplyAuraName3 || 0)}</td><td>${esc(sp.EffectTriggerSpell3 || 0)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `));
  } catch (err) {
    console.error("public spell detail failed", err);
    render(req, res, "Spell Error", errorCard("Spell detail page failed."));
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
        <td><a href="/armory/item/${esc(m.entry)}"><img class="item-icon" src="${itemIconUrl(m.displayid)}" alt=""> <strong>${esc(m.name || "Unnamed Mount")}</strong></a></td>
        <td><a href="/armory/item/${esc(m.entry)}">${esc(m.entry)}</a></td>
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
        <td><strong>${esc(getAchievementName(a.ID))}</strong></td>
        <td>${esc((getAchievement(a.ID).description || "").slice(0, 140))}</td>
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
        <thead><tr><th>Achievement</th><th>Description</th><th>ID</th><th>Points</th><th>Map</th><th>Faction</th><th>Count</th></tr></thead>
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
        <td><strong>${esc(getTitleName(t.alliance_id))}</strong></td>
        <td>${esc(t.alliance_id)}</td>
        <td><strong>${esc(getTitleName(t.horde_id))}</strong></td>
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



app.get("/armory/item/:entry", async (req, res) => {
  const entry = Number(req.params.entry);

  if (!Number.isInteger(entry) || entry <= 0) {
    return render(req, res, "Item Database", errorCard("Invalid item entry ID."));
  }

  try {
    const conn = await worldDb();

    const [items] = await conn.execute(
      `SELECT *
       FROM item_template
       WHERE entry = ?
       LIMIT 1`,
      [entry]
    );

    if (!items.length) {
      await conn.end();
      return render(req, res, "Item Database", errorCard("Item not found."));
    }

    const item = items[0];

    const [vendors] = await conn.execute(
      `SELECT nv.entry AS vendorEntry, ct.name AS vendorName, ct.subname, nv.slot, nv.maxcount, nv.incrtime, nv.ExtendedCost
       FROM npc_vendor nv
       LEFT JOIN creature_template ct ON ct.entry = nv.entry
       WHERE nv.item = ?
       ORDER BY ct.name ASC, nv.entry ASC
       LIMIT 100`,
      [entry]
    );

    const [drops] = await conn.execute(
      `SELECT clt.Entry AS lootEntry, clt.Chance, clt.MinCount, clt.MaxCount, clt.QuestRequired, clt.Comment,
              ct.entry AS creatureEntry, ct.name AS creatureName, ct.minlevel, ct.maxlevel, ct.rank
       FROM creature_loot_template clt
       LEFT JOIN creature_template ct ON ct.lootid = clt.Entry
       WHERE clt.Item = ?
       ORDER BY clt.Chance DESC, ct.name ASC
       LIMIT 100`,
      [entry]
    );

    await conn.end();

    const statRows = Array.from({ length: 10 }, (_, idx) => {
      const n = idx + 1;
      const type = item[`stat_type${n}`];
      const value = item[`stat_value${n}`];
      if (!type || !value) return "";
      return `<tr><td>Stat ${n}</td><td>${esc(type)}</td><td><strong>${esc(value)}</strong></td></tr>`;
    }).join("");

    const spellRows = Array.from({ length: 5 }, (_, idx) => {
      const n = idx + 1;
      const spell = item[`spellid_${n}`];
      const trigger = item[`spelltrigger_${n}`];
      const charges = item[`spellcharges_${n}`];
      const cooldown = item[`spellcooldown_${n}`];
      if (!spell) return "";
      return `<tr><td>${n}</td><td>${esc(spell)}</td><td>${esc(trigger)}</td><td>${esc(charges)}</td><td>${esc(cooldown)}</td></tr>`;
    }).join("");

    const vendorRows = vendors.map(v => `
      <tr>
        <td><strong>${esc(v.vendorName || "Unknown Vendor")}</strong></td>
        <td>${esc(v.vendorEntry)}</td>
        <td>${esc(v.subname || "")}</td>
        <td>${esc(v.maxcount)}</td>
        <td>${esc(v.ExtendedCost)}</td>
      </tr>
    `).join("");

    const dropRows = drops.map(d => `
      <tr>
        <td><strong>${esc(d.creatureName || "Unknown / Reference Loot")}</strong></td>
        <td>${esc(d.creatureEntry || d.lootEntry)}</td>
        <td>${esc(d.Chance)}%</td>
        <td>${esc(d.MinCount)} - ${esc(d.MaxCount)}</td>
        <td>${d.QuestRequired ? "Yes" : "No"}</td>
      </tr>
    `).join("");

    const isCustomItem = Number(item.entry) >= 900000;

    render(req, res, `${item.name} - Item Database`, databaseFrame("items", item.name || "Item", `Entry ${item.entry} · ${itemQualityName(item.Quality)} · Item Level ${item.ItemLevel || 0}`, `
      <div class="card item-detail-hero">
        <h2><img class="item-icon large" src="${itemIconUrl(item.displayid)}" alt=""> ${esc(item.name)}</h2>
        <p class="muted">
          Entry ${esc(item.entry)} · ${esc(itemQualityName(item.Quality))} · Item Level ${esc(item.ItemLevel || 0)}
          ${isCustomItem ? " · <span class='badge'>FrozenThrone Custom</span>" : ""}
        </p>
        <a class="ft-btn secondary" href="/armory/items">Back to Items</a>
      </div>

      <div class="grid grid-4">
        <div class="card stat"><span>Entry ID</span><strong>${esc(item.entry)}</strong></div>
        <div class="card stat"><span>Display ID</span><strong>${esc(item.displayid)}</strong></div>
        <div class="card stat"><span>Item Level</span><strong>${esc(item.ItemLevel || 0)}</strong></div>
        <div class="card stat"><span>Required Level</span><strong>${esc(item.RequiredLevel || 0)}</strong></div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h3>⚔ Item Information</h3>
          <div class="table-wrap">
            <table class="data-table">
              <tbody>
                <tr><td>Class</td><td>${esc(item.class)}</td></tr>
                <tr><td>Subclass</td><td>${esc(item.subclass)}</td></tr>
                <tr><td>Inventory Type</td><td>${esc(item.InventoryType)}</td></tr>
                <tr><td>Quality</td><td>${esc(itemQualityName(item.Quality))}</td></tr>
                <tr><td>Stackable</td><td>${esc(item.stackable)}</td></tr>
                <tr><td>Container Slots</td><td>${esc(item.ContainerSlots)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h3>🛡 Combat Statistics</h3>
          <div class="table-wrap">
            <table class="data-table">
              <tbody>
                <tr><td>Damage</td><td>${esc(item.dmg_min1)} - ${esc(item.dmg_max1)}</td></tr>
                <tr><td>Damage Type</td><td>${esc(item.dmg_type1)}</td></tr>
                <tr><td>Armor</td><td>${esc(item.armor)}</td></tr>
                <tr><td>Delay</td><td>${esc(item.delay)}</td></tr>
                <tr><td>Fire / Frost / Shadow</td><td>${esc(item.fire_res)} / ${esc(item.frost_res)} / ${esc(item.shadow_res)}</td></tr>
                <tr><td>Holy / Arcane</td><td>${esc(item.holy_res)} / ${esc(item.arcane_res)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h3>📈 Stats</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Slot</th><th>Stat Type</th><th>Value</th></tr></thead>
              <tbody>${statRows || `<tr><td colspan="3">No stats.</td></tr>`}</tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h3>✨ Equip / Use Effects</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>#</th><th>Spell ID</th><th>Trigger</th><th>Charges</th><th>Cooldown</th></tr></thead>
              <tbody>${spellRows || `<tr><td colspan="5">No spell effects.</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h3>🏪 Sold By</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Vendor</th><th>Entry</th><th>Subname</th><th>Max</th><th>Ext Cost</th></tr></thead>
              <tbody>${vendorRows || `<tr><td colspan="5">No vendors found.</td></tr>`}</tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h3>💀 Dropped By</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Creature</th><th>Entry</th><th>Chance</th><th>Count</th><th>Quest</th></tr></thead>
              <tbody>${dropRows || `<tr><td colspan="5">No creature drops found.</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>
    `));
  } catch (err) {
    console.error("public item detail failed", err);
    render(req, res, "Item Error", errorCard("Item detail page failed."));
  }
});



app.get("/armory/npc/:entry", async (req, res) => {
  const entry = Number(req.params.entry);

  if (!Number.isInteger(entry) || entry <= 0) {
    return render(req, res, "NPC Database", errorCard("Invalid NPC entry."));
  }

  try {
    const conn = await worldDb();

    const [npcs] = await conn.execute(
      `SELECT * FROM creature_template WHERE entry = ? LIMIT 1`,
      [entry]
    );

    if (!npcs.length) {
      await conn.end();
      return render(req, res, "NPC Database", errorCard("NPC not found."));
    }

    const npc = npcs[0];

    const [vendorItems] = await conn.execute(
      `SELECT nv.slot, nv.item, nv.maxcount, nv.ExtendedCost,
              it.name, it.Quality, it.ItemLevel, it.displayid
       FROM npc_vendor nv
       LEFT JOIN item_template it ON it.entry = nv.item
       WHERE nv.entry = ?
       ORDER BY nv.slot ASC, nv.item ASC
       LIMIT 300`,
      [entry]
    );

    const [loot] = await conn.execute(
      `SELECT clt.Item, clt.Chance, clt.MinCount, clt.MaxCount, clt.QuestRequired,
              it.name, it.Quality, it.ItemLevel, it.displayid
       FROM creature_loot_template clt
       LEFT JOIN item_template it ON it.entry = clt.Item
       WHERE clt.Entry = ? OR clt.Entry = ?
       ORDER BY clt.Chance DESC, clt.Item ASC
       LIMIT 300`,
      [entry, npc.lootid]
    );

    const [questStarts] = await conn.execute(
      `SELECT qs.quest, qt.LogTitle
       FROM creature_queststarter qs
       LEFT JOIN quest_template qt ON qt.ID = qs.quest
       WHERE qs.id = ?
       ORDER BY qs.quest ASC
       LIMIT 200`,
      [entry]
    );

    const [questEnds] = await conn.execute(
      `SELECT qe.quest, qt.LogTitle
       FROM creature_questender qe
       LEFT JOIN quest_template qt ON qt.ID = qe.quest
       WHERE qe.id = ?
       ORDER BY qe.quest ASC
       LIMIT 200`,
      [entry]
    );

    await conn.end();

    const vendorRows = vendorItems.map(v => `
      <tr>
        <td>${esc(v.slot)}</td>
        <td><a href="/armory/item/${v.item}"><img class="item-icon" src="${itemIconUrl(v.displayid)}" alt=""> <strong>${esc(v.name || "Unknown Item")}</strong></a></td>
        <td>${esc(v.item)}</td>
        <td>${esc(v.ItemLevel || "")}</td>
        <td>${esc(itemQualityName(v.Quality))}</td>
        <td>${esc(v.maxcount)}</td>
        <td>${esc(v.ExtendedCost)}</td>
      </tr>
    `).join("");

    const lootRows = loot.map(l => `
      <tr>
        <td><a href="/armory/item/${l.Item}"><img class="item-icon" src="${itemIconUrl(l.displayid)}" alt=""> <strong>${esc(l.name || "Unknown Item")}</strong></a></td>
        <td>${esc(l.Item)}</td>
        <td>${esc(l.Chance)}%</td>
        <td>${esc(l.MinCount)} - ${esc(l.MaxCount)}</td>
        <td>${l.QuestRequired ? "Yes" : "No"}</td>
      </tr>
    `).join("");

    const startRows = questStarts.map(q => `
      <tr><td><a href="/armory/quests?q=${esc(q.quest)}">${esc(q.quest)}</a></td><td>${esc(q.LogTitle || "")}</td></tr>
    `).join("");

    const endRows = questEnds.map(q => `
      <tr><td><a href="/armory/quests?q=${esc(q.quest)}">${esc(q.quest)}</a></td><td>${esc(q.LogTitle || "")}</td></tr>
    `).join("");

    render(req, res, `${npc.name} - NPC Database`, databaseFrame("npcs", npc.name || "NPC", `${npc.subname || ""} · Entry ${npc.entry} · Level ${npc.minlevel}-${npc.maxlevel}`, `
      <div class="card item-detail-hero">
        <h2>${esc(npc.name)}</h2>
        <p class="muted">${esc(npc.subname || "")} · Entry ${esc(npc.entry)} · Level ${esc(npc.minlevel)}-${esc(npc.maxlevel)}</p>
        <a class="ft-btn secondary" href="/armory/npcs">Back to NPCs</a>
      </div>

      <div class="grid grid-4">
        <div class="card stat"><span>Entry</span><strong>${esc(npc.entry)}</strong></div>
        <div class="card stat"><span>Faction</span><strong>${esc(npc.faction)}</strong></div>
        <div class="card stat"><span>NPC Flags</span><strong>${esc(npc.npcflag)}</strong></div>
        <div class="card stat"><span>Scale</span><strong>${esc(npc.scale)}</strong></div>
        <div class="card stat"><span>Model</span><strong>${esc(npc.modelid1)}</strong></div>
        <div class="card stat"><span>Loot ID</span><strong>${esc(npc.lootid)}</strong></div>
        <div class="card stat"><span>Rank</span><strong>${esc(npc.rank)}</strong></div>
        <div class="card stat"><span>Type</span><strong>${esc(npc.type)}</strong></div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h3>⚔ Combat / Template</h3>
          <div class="table-wrap">
            <table class="data-table">
              <tbody>
                <tr><td>Unit Class</td><td>${esc(npc.unit_class)}</td></tr>
                <tr><td>Base Attack Time</td><td>${esc(npc.BaseAttackTime)}</td></tr>
                <tr><td>Range Attack Time</td><td>${esc(npc.RangeAttackTime)}</td></tr>
                <tr><td>Health Modifier</td><td>${esc(npc.HealthModifier)}</td></tr>
                <tr><td>Damage Modifier</td><td>${esc(npc.DamageModifier)}</td></tr>
                <tr><td>Armor Modifier</td><td>${esc(npc.ArmorModifier)}</td></tr>
                <tr><td>Movement Type</td><td>${esc(npc.MovementType)}</td></tr>
                <tr><td>Gossip Menu</td><td>${esc(npc.gossip_menu_id)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h3>📜 Quests</h3>
          <div class="grid grid-2">
            <div>
              <h4>Starts</h4>
              <table class="data-table"><tbody>${startRows || `<tr><td>Starts no quests.</td></tr>`}</tbody></table>
            </div>
            <div>
              <h4>Ends</h4>
              <table class="data-table"><tbody>${endRows || `<tr><td>Ends no quests.</td></tr>`}</tbody></table>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>🏪 Vendor Items</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Slot</th><th>Item</th><th>Entry</th><th>iLvl</th><th>Quality</th><th>Max</th><th>Ext Cost</th></tr></thead>
            <tbody>${vendorRows || `<tr><td colspan="7">This NPC sells no vendor items.</td></tr>`}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h3>💀 Loot</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Item</th><th>Entry</th><th>Chance</th><th>Count</th><th>Quest</th></tr></thead>
            <tbody>${lootRows || `<tr><td colspan="5">No creature loot found.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `));
  } catch (err) {
    console.error("public npc detail failed", err);
    render(req, res, "NPC Error", errorCard("NPC detail page failed."));
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