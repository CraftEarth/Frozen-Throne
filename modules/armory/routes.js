const path = require("path");
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
    getActiveRealm,
    publicCharacterFilter,
    databaseExists,
    characterDb,
    worldDb,
    raceName,
    className,
    moneyToGold,
    itemIconUrl,
    itemQualityName
  } = tools;

  const classOptions = [
    [1, "Warrior"],
    [2, "Paladin"],
    [3, "Hunter"],
    [4, "Rogue"],
    [5, "Priest"],
    [6, "Death Knight"],
    [7, "Shaman"],
    [8, "Mage"],
    [9, "Warlock"],
    [11, "Druid"]
  ];

  app.get("/armory/assets/armory.css", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(path.join(__dirname, "armory.css"));
  });

  function number(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatNumber(value) {
    return number(value).toLocaleString("en-US");
  }

  function formatDuration(value) {
    const seconds = number(value);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days) return `${days}d ${hours}h`;
    return `${hours}h`;
  }

  function formatLastSeen(value, online = false) {
    if (online) return "Online now";
    const timestamp = number(value);
    if (!timestamp) return "Never recorded";
    const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
    if (elapsed < 3600) return `${Math.max(1, Math.floor(elapsed / 60))}m ago`;
    if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h ago`;
    if (elapsed < 2592000) return `${Math.floor(elapsed / 86400)}d ago`;
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function classSlug(value) {
    return String(className(value) || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function selected(current, expected) {
    return String(current) === String(expected) ? "selected" : "";
  }

  function databaseTabs(active = "overview") {
    const tabs = [
      ["overview", "Armory Home", "/armory"],
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
            <p class="eyebrow">FrozenThrone Armory</p>
            <h1>${esc(title)}</h1>
            <p>${esc(description)}</p>
          </div>
          ${databaseTabs(active)}
          <div class="ft-panel">${content}</div>
        </section>
      </main>
    `;
  }


app.get(["/armory", "/database"], async (req, res) => {
  if (req.query.tab === "characters") return res.redirect("/armory/characters");

  const realm = getActiveRealm(req);
  let conn;

  try {
    const exists = await databaseExists(realm);
    if (!exists) return render(req, res, "Armory Error", errorCard(`${realm.name} is unavailable.`));

    conn = await characterDb(realm);
    const [summaryRows] = await conn.execute(
      `SELECT COUNT(*) AS totalCharacters,
              COALESCE(SUM(CASE WHEN c.online = 1 THEN 1 ELSE 0 END), 0) AS onlineNow,
              COALESCE(SUM(CASE WHEN c.level >= 80 THEN 1 ELSE 0 END), 0) AS maxLevel,
              COALESCE(SUM(c.totalKills), 0) AS honorableKills
       FROM characters c
       WHERE ${publicCharacterFilter(realm, "c")}`
    );
    const [guildRows] = await conn.execute("SELECT COUNT(*) AS guilds FROM guild");
    await conn.end();
    conn = null;

    const summary = summaryRows[0] || {};
    const guilds = guildRows[0]?.guilds || 0;
    const features = [
      ["characters", "Characters", "Search every public hero, inspect gear, stats, achievements, talents, and inventory.", "/armory/characters", "♞"],
      ["items", "Items", "Explore equipment, custom rewards, item levels, stats, vendors, and drop sources.", "/armory/items", "◆"],
      ["npcs", "NPCs", "Find creatures, trainers, vendors, quest givers, loot tables, and template details.", "/armory/npcs", "♜"],
      ["quests", "Quests", "Browse objectives, level requirements, rewards, quest chains, and database IDs.", "/armory/quests", "✦"],
      ["spells", "Spells", "Search spell effects, schools, cast times, power costs, and learned abilities.", "/armory/spells", "✧"],
      ["mounts", "Mounts", "Discover collectible mounts, riding spells, movement speeds, and requirements.", "/armory/mounts", "♘"],
      ["titles", "Titles", "Review Alliance and Horde title mappings available throughout the realms.", "/armory/titles", "♛"],
      ["achievements", "Achievements", "Look up achievements, categories, points, criteria, and completion goals.", "/armory/achievements", "★"]
    ];

    render(req, res, `Armory | ${realm.name}`, `
      <main class="container armory-hub-page">
        <section>
          <header class="armory-hub-hero">
            <div>
              <p class="eyebrow">${esc(realm.name)} Live Database</p>
              <h1>World Armory</h1>
              <p class="lead">One gateway to every hero, item, creature, quest, spell, mount, title, and achievement shaping ${esc(realm.name)}.</p>
              <div class="armory-hero-actions">
                <a class="armory-primary-action" href="/armory/characters">Find a Character</a>
                <a href="/players">View Realm Champions</a>
                <a href="/guilds">Explore Guilds</a>
              </div>
            </div>
            <div class="armory-hub-emblem" aria-hidden="true"><span>FT</span><small>ARMORY</small></div>
          </header>

          <div class="armory-summary-grid">
            <div><span>Public Heroes</span><strong>${esc(formatNumber(summary.totalCharacters))}</strong></div>
            <div><span>Online Now</span><strong class="online">${esc(formatNumber(summary.onlineNow))}</strong></div>
            <div><span>Level 80+</span><strong>${esc(formatNumber(summary.maxLevel))}</strong></div>
            <div><span>Honorable Kills</span><strong>${esc(formatNumber(summary.honorableKills))}</strong></div>
            <div><span>Active Guilds</span><strong>${esc(formatNumber(guilds))}</strong></div>
          </div>

          <section class="armory-browse-section">
            <div class="armory-section-heading">
              <div><p class="eyebrow">Choose a Database</p><h2>Explore ${esc(realm.name)}</h2></div>
              <p>Live realm data, organized into focused sections and connected directly to character profiles.</p>
            </div>
            <div class="armory-feature-grid">
              ${features.map(([key, label, description, href, icon]) => `
                <a class="armory-feature-card armory-feature-${key}" href="${href}">
                  <span class="armory-feature-icon" aria-hidden="true">${icon}</span>
                  <span><small>Database</small><strong>${label}</strong><p>${description}</p></span>
                  <b aria-hidden="true">›</b>
                </a>`).join("")}
            </div>
          </section>

          <section class="armory-crossroads">
            <div><p class="eyebrow">Live Competition</p><h2>Looking for the strongest heroes?</h2><p>Continue into rankings for realm leaders, class champions, PvP standings, wealth, achievements, and activity.</p></div>
            <a href="/players">Open Player Rankings <span>›</span></a>
          </section>
        </section>
      </main>
    `, {
      seo: {
        title: `FrozenThrone Armory & World Database | ${realm.name}`,
        description: `Browse ${realm.name} characters, gear, items, NPCs, quests, spells, mounts, titles, and achievements in the FrozenThrone Armory.`,
        url: "https://frozenthrone.co/armory"
      }
    });
  } catch (err) {
    try { if (conn) await conn.end(); } catch {}
    console.error("Armory hub failed", err);
    render(req, res, "Armory Error", errorCard("The Armory could not load. Check website.log for details."));
  }
});

app.get("/armory/characters", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const classFilter = String(req.query.class || "").trim();
    const statusFilter = String(req.query.status || "").trim().toLowerCase();
    const realm = getActiveRealm(req);
    const exists = await databaseExists(realm);
    if (!exists) return render(req, res, "Armory Error", errorCard(`${realm.name} is unavailable.`));

    const conn = await characterDb(realm);
    const params = [];
    let where = publicCharacterFilter(realm, "c");
    if (search) {
      where += " AND c.name LIKE ?";
      params.push(`%${search}%`);
    }

    if (classOptions.some(([id]) => String(id) === classFilter)) {
      where += " AND c.class = ?";
      params.push(Number(classFilter));
    }

    if (statusFilter === "online") where += " AND c.online = 1";
    if (statusFilter === "offline") where += " AND c.online = 0";

    const [chars] = await conn.execute(
      `SELECT c.guid, c.name, c.race, c.class, c.level, c.money, c.online, c.totalKills,
              c.totaltime, c.logout_time, g.guildid, g.name AS guildName
       FROM characters c
       LEFT JOIN guild_member gm ON gm.guid = c.guid
       LEFT JOIN guild g ON g.guildid = gm.guildid
       WHERE ${where}
       ORDER BY c.online DESC, c.level DESC, c.name ASC
       LIMIT 100`,
      params
    );

    const [summaryRows] = await conn.execute(
      `SELECT COUNT(*) AS totalCharacters,
              COALESCE(SUM(CASE WHEN c.online = 1 THEN 1 ELSE 0 END), 0) AS onlineNow,
              COALESCE(SUM(CASE WHEN c.level >= 80 THEN 1 ELSE 0 END), 0) AS maxLevel,
              COALESCE(SUM(c.totalKills), 0) AS honorableKills
       FROM characters c
       WHERE ${publicCharacterFilter(realm, "c")}`
    );
    await conn.end();

    const summary = summaryRows[0] || {};
    const rows = chars.map((ch) => `
      <tr class="armory-character-row">
        <td>
          <a class="armory-character-identity" href="/armory/${encodeURIComponent(realm.key)}/${number(ch.guid)}">
            <span class="armory-character-avatar class-${esc(classSlug(ch.class))}" aria-hidden="true">${esc(String(ch.name || "?").slice(0, 1).toUpperCase())}</span>
            <span><strong class="class-${esc(classSlug(ch.class))}">${esc(ch.name)}</strong><small>${esc(raceName(ch.race))} ${esc(className(ch.class))}</small></span>
          </a>
        </td>
        <td><strong>${esc(ch.level)}</strong></td>
        <td><span class="armory-class-pill class-${esc(classSlug(ch.class))}">${esc(className(ch.class))}</span></td>
        <td>${ch.guildid ? `<a class="armory-guild-link" href="/guilds/${esc(ch.guildid)}">&lt;${esc(ch.guildName)}&gt;</a>` : `<span class="muted">—</span>`}</td>
        <td>${esc(formatNumber(ch.totalKills))}</td>
        <td>${esc(moneyToGold(ch.money))}g</td>
        <td>${esc(formatDuration(ch.totaltime))}</td>
        <td><span class="armory-status ${ch.online ? "online" : "offline"}">${ch.online ? "● Online" : "○ Offline"}</span><small class="armory-last-seen">${esc(formatLastSeen(ch.logout_time, ch.online))}</small></td>
        <td><a class="armory-view-profile" href="/armory/${encodeURIComponent(realm.key)}/${number(ch.guid)}">View Profile</a></td>
      </tr>
    `).join("");

    const card = `
      <div class="armory-directory-panel">
        <div class="table-wrap">
          <table class="data-table armory-directory-table">
            <thead><tr><th>Character</th><th>Level</th><th>Class</th><th>Guild</th><th>HKs</th><th>Gold</th><th>Played</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows || `<tr><td colspan="9" class="armory-empty-directory"><strong>No heroes found.</strong><span>Try a different name, class, or status filter.</span></td></tr>`}</tbody>
          </table>
        </div>
      </div>`;

    render(req, res, "Characters Database", databaseFrame(
      "characters",
      "Characters",
      "Browse player profiles, gear, race, class, level, and online status.",
      `
        <div class="armory-directory-summary">
          <div><span>Public Heroes</span><strong>${esc(formatNumber(summary.totalCharacters))}</strong></div>
          <div><span>Online Now</span><strong class="online">${esc(formatNumber(summary.onlineNow))}</strong></div>
          <div><span>Level 80+</span><strong>${esc(formatNumber(summary.maxLevel))}</strong></div>
          <div><span>Honorable Kills</span><strong>${esc(formatNumber(summary.honorableKills))}</strong></div>
        </div>

        <div class="armory-directory-heading">
          <div><p class="eyebrow">Live Character Directory</p><h2>Find Your Hero</h2></div>
          <p>${esc(formatNumber(chars.length))} result${chars.length === 1 ? "" : "s"} shown · Maximum 100</p>
        </div>

        <form class="armory-filter-bar" method="GET" action="/armory/characters">
          <label class="armory-name-filter"><span>Character Name</span><input type="search" name="search" value="${esc(search)}" placeholder="Search heroes..."></label>
          <label><span>Class</span><select name="class"><option value="">All Classes</option>${classOptions.map(([id, label]) => `<option value="${id}" ${selected(classFilter, id)}>${label}</option>`).join("")}</select></label>
          <label><span>Status</span><select name="status"><option value="">Any Status</option><option value="online" ${selected(statusFilter, "online")}>Online</option><option value="offline" ${selected(statusFilter, "offline")}>Offline</option></select></label>
          <div class="armory-filter-actions"><button type="submit">Search Armory</button><a href="/armory/characters">Reset</a></div>
        </form>
        <div class="database-results armory-directory-results">${card}</div>
      `
    ), {
      seo: {
        title: `${realm.name} Character Armory | FrozenThrone`,
        description: `Search public ${realm.name} characters and inspect their gear, stats, guilds, PvP kills, playtime, and online status.`,
        url: "https://frozenthrone.co/armory/characters"
      }
    });
  } catch (err) {
    console.error(err);
    render(req, res, "Armory Error", errorCard("Armory failed to load. Check website.log for the SQL error."));
  }
});



app.get("/armory/items", async (req, res) => {
  const q = String(req.query.q || "").trim();

  try {
    const conn = await worldDb(getActiveRealm(req));
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
    const conn = await worldDb(getActiveRealm(req));
    let rows = [];

    if (q) {
      if (/^\d+$/.test(q)) {
        [rows] = await conn.execute(
          `SELECT entry, name, subname, minlevel, maxlevel, npcflag
           FROM creature_template WHERE entry = ? LIMIT 100`,
          [Number(q)]
        );
      } else {
        [rows] = await conn.execute(
          `SELECT entry, name, subname, minlevel, maxlevel, npcflag
           FROM creature_template WHERE name LIKE ? OR subname LIKE ?
           ORDER BY entry ASC LIMIT 100`,
          [`%${q}%`, `%${q}%`]
        );
      }
    } else {
      [rows] = await conn.execute(
        `SELECT entry, name, subname, minlevel, maxlevel, npcflag
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
    const conn = await worldDb(getActiveRealm(req));
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
    const conn = await worldDb(getActiveRealm(req));

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
    const conn = await worldDb(getActiveRealm(req));
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
    const conn = await worldDb(getActiveRealm(req));

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
    const conn = await worldDb(getActiveRealm(req));
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
    const conn = await worldDb(getActiveRealm(req));
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
    const conn = await worldDb(getActiveRealm(req));
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
    const conn = await worldDb(getActiveRealm(req));

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
    const conn = await worldDb(getActiveRealm(req));

    const [npcs] = await conn.execute(
      `SELECT * FROM creature_template WHERE entry = ? LIMIT 1`,
      [entry]
    );

    if (!npcs.length) {
      await conn.end();
      return render(req, res, "NPC Database", errorCard("NPC not found."));
    }

    const npc = npcs[0];

    // TrinityCore stores creature displays separately from creature_template.
    npc.modelid1 = Number(npc.modelid1 || 0);
    npc.scale = Number(npc.scale || 0);

    if (!npc.modelid1) {
      try {
        const [models] = await conn.execute(
          `SELECT CreatureDisplayID, DisplayScale
           FROM creature_template_model
           WHERE CreatureID = ?
           LIMIT 1`,
          [entry]
        );

        npc.modelid1 = Number(models[0]?.CreatureDisplayID || 0);
        npc.scale = Number(models[0]?.DisplayScale || 1);
      } catch (modelError) {
        console.warn("NPC model lookup failed", entry, modelError.message);
      }
    }

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

      ${npc.modelid1 ? `
        <div class="card npc-model-card">
          <div class="npc-model-heading">
            <div>
              <p class="eyebrow">Interactive Creature Model</p>
              <h2>3D Appearance</h2>
            </div>
            <span>Display ID ${esc(npc.modelid1)}</span>
          </div>

          <div id="npc-model-viewer"
               data-model-id="${esc(npc.modelid1)}"
               data-model-scale="${esc(npc.scale || 1)}">
            <div class="npc-model-loading">Loading NPC model...</div>
            <div id="npc-model-3d"></div>
          </div>

          <p class="muted npc-model-help">Drag to rotate · Scroll to zoom</p>
        </div>
        <script src="https://code.jquery.com/jquery-3.5.1.min.js"></script>
        <script src="/modelviewer/live/viewer/viewer.min.js"></script>
        <script type="module" src="/js/npc-model-viewer.js?v=2"></script>
      ` : ""}

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
  const activeRealm = getActiveRealm(req);
  const guid = Number(req.params.guid);

  if (!realm || !Number.isInteger(guid) || guid <= 0) {
    return render(req, res, "Character Database", errorCard("Invalid character database request."));
  }
  if (realm.key !== activeRealm.key) {
    return res.redirect("/armory/characters");
  }

  let charConn;
  let worldConn;

  try {
    charConn = await characterDb(realm);
    worldConn = await worldDb(realm);

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
