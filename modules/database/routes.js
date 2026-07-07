const { qualityName, qualityClass } = require("./helpers");

module.exports = function registerDatabaseRoutes(app, tools) {
  const { render, esc, mysql, dbConfig } = tools;

  async function worldDb() {
    return mysql.createPool({
      ...dbConfig,
      database: "world",
      waitForConnections: true,
      connectionLimit: 10
    });
  }

  app.get("/db", async (req, res) => {
    render(req, res, "FrozenCore Database", `
      <main class="container">
        <section class="section-head">
          <p class="eyebrow">FrozenCore</p>
          <h1>Database</h1>
          <p>Search real FrozenThrone TrinityCore data.</p>
        </section>

        <form class="ft-search" method="GET" action="/db/search">
          <input name="q" placeholder="Search items, NPCs, quests..." required>
          <button class="btn" type="submit">Search</button>
        </form>

        <div class="grid">
          <a class="card" href="/db/items"><h3>Items</h3><p>Weapons, armor, consumables, custom items.</p></a>
          <a class="card" href="/db/npcs"><h3>NPCs</h3><p>Creatures, bosses, vendors, trainers.</p></a>
          <a class="card" href="/db/quests"><h3>Quests</h3><p>Quest data from the live world database.</p></a>
        </div>
      </main>
    `);
  });

  app.get("/db/search", async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) return res.redirect("/db");

    try {
      const conn = await worldDb();
      const like = `%${q}%`;

      const [items] = await conn.execute(`
        SELECT entry, name, Quality, ItemLevel, RequiredLevel
        FROM item_template
        WHERE entry = ? OR name LIKE ?
        ORDER BY Quality DESC, ItemLevel DESC
        LIMIT 25
      `, [Number(q) || 0, like]);

      const [npcs] = await conn.execute(`
        SELECT entry, name, subname, minlevel, maxlevel, faction
        FROM creature_template
        WHERE entry = ? OR name LIKE ? OR subname LIKE ?
        ORDER BY maxlevel DESC
        LIMIT 25
      `, [Number(q) || 0, like, like]);

      const [quests] = await conn.execute(`
        SELECT ID, LogTitle, QuestLevel, MinLevel
        FROM quest_template
        WHERE ID = ? OR LogTitle LIKE ?
        ORDER BY QuestLevel DESC
        LIMIT 25
      `, [Number(q) || 0, like]);

      const itemRows = items.map(i => `
        <tr>
          <td><a class="${qualityClass(i.Quality)}" href="/db/item/${i.entry}">${esc(i.name)}</a></td>
          <td>${esc(i.entry)}</td>
          <td>${esc(qualityName(i.Quality))}</td>
          <td>${esc(i.ItemLevel)}</td>
          <td>${esc(i.RequiredLevel)}</td>
        </tr>
      `).join("");

      const npcRows = npcs.map(n => `
        <tr>
          <td><a href="/db/npc/${n.entry}">${esc(n.name)}</a><br><small>${esc(n.subname || "")}</small></td>
          <td>${esc(n.entry)}</td>
          <td>${esc(n.minlevel)}-${esc(n.maxlevel)}</td>
          <td>${esc(n.faction)}</td>
        </tr>
      `).join("");

      const questRows = quests.map(qs => `
        <tr>
          <td><a href="/db/quest/${qs.ID}">${esc(qs.LogTitle)}</a></td>
          <td>${esc(qs.ID)}</td>
          <td>${esc(qs.QuestLevel)}</td>
          <td>${esc(qs.MinLevel)}</td>
        </tr>
      `).join("");

      render(req, res, `Search: ${q}`, `
        <main class="container">
          <section class="section-head">
            <p class="eyebrow">FrozenCore Search</p>
            <h1>Search Results for ${esc(q)}</h1>
          </section>

          <form class="ft-search" method="GET" action="/db/search">
            <input name="q" value="${esc(q)}">
            <button class="btn" type="submit">Search</button>
          </form>

          <div class="card"><h3>Items</h3><div class="table-wrap"><table class="data-table">
            <thead><tr><th>Name</th><th>ID</th><th>Quality</th><th>iLvl</th><th>Req</th></tr></thead>
            <tbody>${itemRows || `<tr><td colspan="5">No items found.</td></tr>`}</tbody>
          </table></div></div>

          <div class="card"><h3>NPCs</h3><div class="table-wrap"><table class="data-table">
            <thead><tr><th>Name</th><th>ID</th><th>Level</th><th>Faction</th></tr></thead>
            <tbody>${npcRows || `<tr><td colspan="4">No NPCs found.</td></tr>`}</tbody>
          </table></div></div>

          <div class="card"><h3>Quests</h3><div class="table-wrap"><table class="data-table">
            <thead><tr><th>Title</th><th>ID</th><th>Level</th><th>Min</th></tr></thead>
            <tbody>${questRows || `<tr><td colspan="4">No quests found.</td></tr>`}</tbody>
          </table></div></div>
        </main>
      `);
    } catch (err) {
      render(req, res, "Database Error", `<main class="container"><div class="card"><h3>Database Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });
};
