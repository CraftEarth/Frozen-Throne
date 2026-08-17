const path = require("path");
const createPlayersEngine = require("./engine");

const CLASS_OPTIONS = [
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

module.exports = function registerPlayersRoutes(app, tools) {
  const {
    render,
    errorCard,
    esc,
    getActiveRealm,
    characterDb,
    publicCharacterFilter,
    raceName,
    className,
    moneyToGold
  } = tools;
  const engine = createPlayersEngine({ characterDb, publicCharacterFilter });

  app.get("/players/assets/players.css", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(path.join(__dirname, "players.css"));
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
    const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
    if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function classSlug(value) {
    return String(className(value) || "Unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function factionDetails(race) {
    const key = engine.factionOf(race);
    if (key === "alliance") return { key, label: "Alliance", icon: "🦁" };
    if (key === "horde") return { key, label: "Horde", icon: "🛡" };
    return { key, label: "Unknown", icon: "❄" };
  }

  function profileUrl(realm, player) {
    return `/armory/${encodeURIComponent(realm.key)}/${number(player.guid)}`;
  }

  function playerAvatar(player, large = false) {
    const initial = String(player.name || "?").slice(0, 1).toUpperCase();
    return `<span class="player-avatar class-${esc(classSlug(player.class))}${large ? " player-avatar-large" : ""}" aria-hidden="true">${esc(initial)}</span>`;
  }

  function playerIdentity(realm, player) {
    const faction = factionDetails(player.race);
    return `
      <span class="player-identity">
        ${playerAvatar(player)}
        <span>
          <strong class="class-${esc(classSlug(player.class))}">${esc(player.name)}</strong>
          <small>${faction.icon} ${esc(raceName(player.race))} ${esc(className(player.class))}</small>
        </span>
      </span>`;
  }

  function rankingPanel(realm, title, icon, description, rows, valueOf) {
    const contents = rows.length ? rows.map((player, index) => `
      <a class="player-ranking-row" href="${profileUrl(realm, player)}">
        <span class="player-rank-number">${index + 1}</span>
        ${playerIdentity(realm, player)}
        <span class="player-rank-value">${valueOf(player)}</span>
      </a>`).join("") : `<p class="players-empty">No ranking data yet.</p>`;

    return `
      <section class="players-panel" id="ranking-${esc(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">
        <header class="players-panel-head">
          <span class="players-panel-icon" aria-hidden="true">${icon}</span>
          <div><h2>${esc(title)}</h2><p>${esc(description)}</p></div>
        </header>
        <div class="player-ranking-list">${contents}</div>
      </section>`;
  }

  function podium(realm, players) {
    const top = players.slice(0, 3);
    if (!top.length) return `<div class="players-empty"><h2>No champions yet</h2><p>Create a character and begin the climb.</p></div>`;
    const displayOrder = [1, 0, 2].filter(index => top[index]);
    return displayOrder.map(index => {
      const player = top[index];
      const place = index + 1;
      return `
        <a class="player-podium-place place-${place}" href="${profileUrl(realm, player)}">
          <span class="player-podium-crown">${place === 1 ? "♛" : place === 2 ? "◆" : "▲"}</span>
          ${playerAvatar(player, true)}
          <span class="player-podium-rank">#${place}</span>
          <strong class="class-${esc(classSlug(player.class))}">${esc(player.name)}</strong>
          <small>Level ${esc(player.level)} ${esc(className(player.class))}</small>
          <span>${esc(formatNumber(player.totalKills))} honorable kills</span>
        </a>`;
    }).join("");
  }

  function classLeaderCard(realm, player) {
    const faction = factionDetails(player.race);
    return `
      <a class="class-leader-card class-${esc(classSlug(player.class))}" href="${profileUrl(realm, player)}">
        ${playerAvatar(player)}
        <span>
          <small>${esc(className(player.class))} Champion</small>
          <strong>${esc(player.name)}</strong>
          <em>${faction.icon} Level ${esc(player.level)} ${esc(raceName(player.race))}</em>
        </span>
        <b>›</b>
      </a>`;
  }

  function selected(current, value) {
    return String(current) === String(value) ? "selected" : "";
  }

  function directoryRow(realm, player) {
    const faction = factionDetails(player.race);
    const isOnline = number(player.online) === 1;
    return `
      <tr>
        <td><a class="player-directory-name class-${esc(classSlug(player.class))}" href="${profileUrl(realm, player)}">${esc(player.name)}</a></td>
        <td>${esc(player.level)}</td>
        <td><span class="player-faction faction-${faction.key}">${faction.icon} ${faction.label}</span></td>
        <td>${esc(raceName(player.race))}</td>
        <td>${esc(className(player.class))}</td>
        <td>${player.guildid ? `<a href="/guilds/${esc(player.guildid)}">&lt;${esc(player.guildName)}&gt;</a>` : `<span class="muted">—</span>`}</td>
        <td>${esc(formatNumber(player.achievements))}</td>
        <td>${esc(formatNumber(player.totalKills))}</td>
        <td>${esc(formatDuration(player.totaltime))}</td>
        <td><span class="${isOnline ? "online" : "offline"}">${isOnline ? "● Online" : "○ Offline"}</span></td>
        <td>${esc(formatLastSeen(player.logout_time, isOnline))}</td>
      </tr>`;
  }

  async function renderPlayersPage(req, res) {
    const realm = getActiveRealm(req);
    try {
      const data = await engine.dashboard(realm, {
        search: req.query.q,
        classId: req.query.class,
        faction: req.query.faction,
        status: req.query.status
      });
      const filters = data.filters;
      const directoryRows = data.directory.map(player => directoryRow(realm, player)).join("");

      render(req, res, `Player Rankings | ${realm.name}`, `
        <main class="container players-page">
          <section>
            <header class="players-hero">
              <div>
                <p class="eyebrow">${esc(realm.name)} Live Armory</p>
                <h1>Realm Champions</h1>
                <p class="lead">Track the heroes shaping ${esc(realm.name)}. Compare levels, achievements, honorable kills, wealth, playtime, guilds, and current realm activity.</p>
                <div class="players-hero-links">
                  <a href="#player-directory">Browse Every Player</a>
                  <a href="/guilds">Explore Guilds</a>
                  <a href="/armory/characters">Open Armory Database</a>
                </div>
              </div>
              <div class="players-hero-emblem" aria-hidden="true">♛</div>
            </header>

            <div class="players-summary-grid">
              <div><span>Public Characters</span><strong>${esc(formatNumber(data.summary.totalCharacters))}</strong></div>
              <div><span>Online Now</span><strong class="online">${esc(formatNumber(data.summary.onlineNow))}</strong></div>
              <div><span>Active 7 Days</span><strong>${esc(formatNumber(data.summary.activeSevenDays))}</strong></div>
              <div><span>Level 80 Heroes</span><strong>${esc(formatNumber(data.summary.maxLevel))}</strong></div>
              <div><span>Honorable Kills</span><strong>${esc(formatNumber(data.summary.totalKills))}</strong></div>
              <div><span>Achievements Earned</span><strong>${esc(formatNumber(data.summary.totalAchievements))}</strong></div>
            </div>

            <section class="players-podium-section">
              <div class="players-section-heading">
                <div><p class="eyebrow">Highest Level</p><h2>Champions of ${esc(realm.name)}</h2></div>
                <p>Live standings based on level, experience, and honorable kills.</p>
              </div>
              <div class="players-podium">${podium(realm, data.topLevel)}</div>
            </section>

            <nav class="players-jump-nav" aria-label="Ranking categories">
              <a href="#ranking-level-leaders">Level</a>
              <a href="#ranking-honorable-kills">PvP</a>
              <a href="#ranking-achievement-hunters">Achievements</a>
              <a href="#ranking-wealthiest-heroes">Wealth</a>
              <a href="#ranking-most-played">Playtime</a>
              <a href="#player-directory">Directory</a>
            </nav>

            <div class="players-ranking-grid">
              ${rankingPanel(realm, "Level Leaders", "⚔", "Experience and progression leaders.", data.topLevel, player => `<strong>Level ${esc(player.level)}</strong><small>${esc(className(player.class))}</small>`)}
              ${rankingPanel(realm, "Honorable Kills", "☠", "The realm's most accomplished PvP combatants.", data.topKills, player => `<strong>${esc(formatNumber(player.totalKills))}</strong><small>Kills</small>`)}
              ${rankingPanel(realm, "Achievement Hunters", "★", "Characters with the most completed achievements.", data.topAchievements, player => `<strong>${esc(formatNumber(player.achievements))}</strong><small>Earned</small>`)}
              ${rankingPanel(realm, "Wealthiest Heroes", "●", "Top character wealth currently held in gold.", data.topGold, player => `<strong>${esc(moneyToGold(player.money))}g</strong><small>Character Gold</small>`)}
              ${rankingPanel(realm, "Most Played", "⌛", "Heroes with the greatest recorded playtime.", data.mostPlayed, player => `<strong>${esc(formatDuration(player.totaltime))}</strong><small>Played</small>`)}
              ${rankingPanel(realm, "Online Now", "✦", `Heroes currently adventuring on ${realm.name}.`, data.onlineNow.slice(0, 10), player => `<strong class="online">Online</strong><small>Level ${esc(player.level)}</small>`)}
              ${rankingPanel(realm, "Recent Activity", "◉", "Online heroes and the most recently active players.", data.recentlyActive, player => `<strong class="${player.online ? "online" : ""}">${esc(formatLastSeen(player.logout_time, player.online))}</strong><small>Level ${esc(player.level)}</small>`)}
            </div>

            <section class="players-class-section">
              <div class="players-section-heading">
                <div><p class="eyebrow">Class Standings</p><h2>Class Champions</h2></div>
                <p>The highest-ranked public character from every active class.</p>
              </div>
              <div class="class-leader-grid">
                ${data.classLeaders.map(player => classLeaderCard(realm, player)).join("") || `<p class="players-empty">No class leaders yet.</p>`}
              </div>
            </section>

            <section class="players-directory-section" id="player-directory">
              <div class="players-section-heading">
                <div><p class="eyebrow">Live Character Database</p><h2>Player Directory</h2></div>
                <p>${esc(formatNumber(data.directoryMatches))} matching character${data.directoryMatches === 1 ? "" : "s"}. Results are limited to 100 rows.</p>
              </div>

              <form class="players-filter-bar" method="GET" action="/players">
                <label class="players-search-filter">
                  <span>Player or Guild</span>
                  <input type="search" name="q" value="${esc(filters.search)}" placeholder="Search character or guild name">
                </label>
                <label><span>Class</span><select name="class">
                  <option value="">All Classes</option>
                  ${CLASS_OPTIONS.map(([id, label]) => `<option value="${id}" ${selected(filters.classId, id)}>${label}</option>`).join("")}
                </select></label>
                <label><span>Faction</span><select name="faction">
                  <option value="all" ${selected(filters.faction, "all")}>Both Factions</option>
                  <option value="alliance" ${selected(filters.faction, "alliance")}>Alliance</option>
                  <option value="horde" ${selected(filters.faction, "horde")}>Horde</option>
                </select></label>
                <label><span>Status</span><select name="status">
                  <option value="all" ${selected(filters.status, "all")}>Any Status</option>
                  <option value="online" ${selected(filters.status, "online")}>Online Now</option>
                  <option value="offline" ${selected(filters.status, "offline")}>Offline</option>
                </select></label>
                <div class="players-filter-actions">
                  <button type="submit">Apply Filters</button>
                  <a href="/players">Reset</a>
                </div>
              </form>

              <div class="players-directory-panel">
                <div class="table-wrap">
                  <table class="data-table players-directory-table">
                    <thead><tr><th>Player</th><th>Level</th><th>Faction</th><th>Race</th><th>Class</th><th>Guild</th><th>Achievements</th><th>Kills</th><th>Played</th><th>Status</th><th>Last Seen</th></tr></thead>
                    <tbody>${directoryRows || `<tr><td colspan="11"><div class="players-empty"><strong>No players match those filters.</strong><br>Try clearing one of the filters above.</div></td></tr>`}</tbody>
                  </table>
                </div>
              </div>
            </section>

            <aside class="players-privacy-note">
              <strong>Public Armory Data</strong>
              <p>Character progression and activity are public. Account IDs, emails, login information, positions, private notes, and staff characters remain hidden.</p>
            </aside>
          </section>
        </main>
      `, {
        seo: {
          title: `${realm.name} Player Rankings and Armory | FrozenThrone`,
          description: `Explore ${realm.name} player rankings, characters, guilds, classes, achievements, honorable kills, playtime, wealth, and live online activity.`,
          url: "https://frozenthrone.co/players",
          structuredData: [{
            "@type": "CollectionPage",
            name: `${realm.name} Player Rankings`,
            url: "https://frozenthrone.co/players",
            numberOfItems: data.summary.totalCharacters
          }]
        }
      });
    } catch (err) {
      console.error("player rankings failed", err);
      render(req, res, "Player Rankings Error", errorCard("The player rankings could not load. Check the website logs for the database error."));
    }
  }

  app.get(["/players", "/players.html", "/rankings"], renderPlayersPage);

  app.get("/api/players", async (req, res) => {
    try {
      const realm = getActiveRealm(req);
      const data = await engine.dashboard(realm);
      res.json({
        realm: realm.name,
        summary: data.summary,
        topLevel: data.topLevel,
        topGold: data.topGold,
        topKills: data.topKills,
        onlineNow: data.onlineNow,
        topAchievements: data.topAchievements,
        mostPlayed: data.mostPlayed,
        recentlyActive: data.recentlyActive,
        classLeaders: data.classLeaders
      });
    } catch (err) {
      console.error("players API failed", err);
      res.status(500).json({ error: "players failed" });
    }
  });
};
