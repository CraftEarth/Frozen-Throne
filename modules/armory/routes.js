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
