const path = require("path");

const ALLIANCE_RACES = new Set([1, 3, 4, 7, 11]);
const HORDE_RACES = new Set([2, 5, 6, 8, 10]);

module.exports = function registerGuildRoutes(app, tools) {
  const {
    render,
    errorCard,
    esc,
    getActiveRealm,
    characterDb,
    publicCharacterFilter,
    raceName,
    className
  } = tools;

  app.get("/guilds/assets/guilds.css", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(path.join(__dirname, "guilds.css"));
  });

  function numeric(value) {
    const result = Number(value || 0);
    return Number.isFinite(result) ? result : 0;
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "Unknown";
    const raw = String(value).trim();
    const date = /^\d+$/.test(raw)
      ? new Date(Number(raw) * 1000)
      : new Date(raw);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {})
    }).format(date);
  }

  function formatLastSeen(value, online = false) {
    if (online) return "Online now";
    const timestamp = numeric(value);
    if (!timestamp) return "Never recorded";
    const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
    if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`;
    return formatDate(timestamp, false);
  }

  function formatPlaytime(value) {
    const seconds = numeric(value);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days) return `${days}d ${hours}h`;
    return `${hours}h`;
  }

  function factionForCounts(alliance, horde) {
    const allianceCount = numeric(alliance);
    const hordeCount = numeric(horde);
    if (allianceCount && hordeCount) return { key: "mixed", label: "Cross-Faction", icon: "⚔" };
    if (allianceCount) return { key: "alliance", label: "Alliance", icon: "🦁" };
    if (hordeCount) return { key: "horde", label: "Horde", icon: "🛡" };
    return { key: "unknown", label: "Unaligned", icon: "❄" };
  }

  function factionForRace(race) {
    const id = numeric(race);
    if (ALLIANCE_RACES.has(id)) return { key: "alliance", label: "Alliance" };
    if (HORDE_RACES.has(id)) return { key: "horde", label: "Horde" };
    return { key: "unknown", label: "Unknown" };
  }

  function classSlug(value) {
    return String(className(value) || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function guildMark(name, guildId) {
    const first = String(name || "?").trim().slice(0, 1).toUpperCase() || "?";
    const hue = (numeric(guildId) * 47 + String(name || "").length * 13) % 360;
    return `<span class="guild-mark" style="--guild-hue:${esc(hue)}" aria-hidden="true">${esc(first)}</span>`;
  }

  function safeGuildText(value, fallback) {
    const text = String(value || "").trim();
    return text ? esc(text).replace(/\r?\n/g, "<br>") : `<span class="muted">${esc(fallback)}</span>`;
  }

  function directoryCard(guild, realm) {
    const faction = factionForCounts(guild.allianceMembers, guild.hordeMembers);
    const memberCount = numeric(guild.members);
    const onlineCount = numeric(guild.onlineMembers);
    const detailUrl = `/guilds/${numeric(guild.guildid)}`;
    return `
      <article class="guild-directory-card" data-guild-search="${esc(`${guild.name} ${guild.leaderName || ""} ${faction.label}`.toLowerCase())}">
        <a class="guild-directory-link" href="${detailUrl}" aria-label="View ${esc(guild.name)} guild profile">
          <div class="guild-card-top">
            ${guildMark(guild.name, guild.guildid)}
            <div class="guild-card-name">
              <span class="guild-realm">${esc(realm.name)}</span>
              <h2>&lt;${esc(guild.name)}&gt;</h2>
              <span class="guild-faction faction-${faction.key}">${faction.icon} ${faction.label}</span>
            </div>
            <span class="guild-open-arrow" aria-hidden="true">›</span>
          </div>
          <p class="guild-card-motd">${safeGuildText(guild.motd, "No message of the day has been set.")}</p>
          <dl class="guild-card-stats">
            <div><dt>Guild Master</dt><dd>${esc(guild.leaderName || "Unknown")}</dd></div>
            <div><dt>Members</dt><dd>${esc(memberCount)}</dd></div>
            <div><dt>Online</dt><dd class="online">${esc(onlineCount)}</dd></div>
            <div><dt>Avg. Level</dt><dd>${esc(Math.round(numeric(guild.averageLevel)))}</dd></div>
          </dl>
          <div class="guild-card-footer">
            <span>Founded ${esc(formatDate(guild.createdate))}</span>
            <strong>Open Guild Profile</strong>
          </div>
        </a>
      </article>`;
  }

  app.get(["/guilds", "/guilds.html"], async (req, res) => {
    let conn;
    try {
      const realm = getActiveRealm(req);
      conn = await characterDb(realm);
      const visibleMember = publicCharacterFilter(realm, "member_character");
      const [guilds] = await conn.execute(`
        SELECT
          g.guildid,
          g.name,
          g.leaderguid,
          g.createdate,
          g.motd,
          leader.name AS leaderName,
          COUNT(member_character.guid) AS members,
          COALESCE(SUM(CASE WHEN member_character.online = 1 THEN 1 ELSE 0 END), 0) AS onlineMembers,
          COALESCE(AVG(member_character.level), 0) AS averageLevel,
          COALESCE(MAX(member_character.logout_time), 0) AS lastActivity,
          COALESCE(SUM(CASE WHEN member_character.race IN (1, 3, 4, 7, 11) THEN 1 ELSE 0 END), 0) AS allianceMembers,
          COALESCE(SUM(CASE WHEN member_character.race IN (2, 5, 6, 8, 10) THEN 1 ELSE 0 END), 0) AS hordeMembers
        FROM guild g
        LEFT JOIN characters leader ON leader.guid = g.leaderguid
        LEFT JOIN guild_member gm ON gm.guildid = g.guildid
        LEFT JOIN characters member_character
          ON member_character.guid = gm.guid
          AND ${visibleMember}
        GROUP BY g.guildid, g.name, g.leaderguid, g.createdate, g.motd, leader.name
        ORDER BY members DESC, g.name ASC
      `);

      const totalMembers = guilds.reduce((sum, guild) => sum + numeric(guild.members), 0);
      const onlineMembers = guilds.reduce((sum, guild) => sum + numeric(guild.onlineMembers), 0);
      const largestGuild = guilds[0]?.name || "None yet";
      const cards = guilds.map(guild => directoryCard(guild, realm)).join("");

      render(req, res, `Guilds | ${realm.name} Armory`, `
        <main class="container guild-page guild-directory-page">
          <section>
            <header class="guild-directory-hero">
              <div>
                <p class="eyebrow">${esc(realm.name)} Guild Registry</p>
                <h1>Guild Hall</h1>
                <p class="lead">Explore every active guild, meet its leadership, inspect its roster, and follow each member into the live Armory.</p>
              </div>
              <div class="guild-hero-mark" aria-hidden="true">⚔</div>
            </header>

            <div class="guild-summary-grid">
              <div><span>Active Guilds</span><strong>${esc(guilds.length)}</strong></div>
              <div><span>Guild Members</span><strong>${esc(totalMembers)}</strong></div>
              <div><span>Online Now</span><strong class="online">${esc(onlineMembers)}</strong></div>
              <div><span>Largest Guild</span><strong>${esc(largestGuild)}</strong></div>
            </div>

            <div class="guild-directory-tools">
              <label for="guild-directory-search">Find a Guild</label>
              <div class="guild-search-field">
                <span aria-hidden="true">⌕</span>
                <input id="guild-directory-search" type="search" placeholder="Search by guild, leader, or faction" autocomplete="off">
              </div>
              <span id="guild-directory-count">${esc(guilds.length)} guild${guilds.length === 1 ? "" : "s"}</span>
            </div>

            <div class="guild-directory-grid" id="guild-directory-grid">
              ${cards || `<div class="guild-empty-state"><h2>No guilds found</h2><p>This realm does not have any public guilds yet.</p></div>`}
            </div>
            <div class="guild-empty-state" id="guild-search-empty" hidden>
              <h2>No matching guilds</h2>
              <p>Try a different guild name, Guild Master, or faction.</p>
            </div>
          </section>
        </main>
        <script>
          (() => {
            const search = document.getElementById("guild-directory-search");
            const cards = [...document.querySelectorAll(".guild-directory-card")];
            const count = document.getElementById("guild-directory-count");
            const empty = document.getElementById("guild-search-empty");
            if (!search) return;
            const filter = () => {
              const query = search.value.trim().toLowerCase();
              let visible = 0;
              cards.forEach(card => {
                const matches = !query || card.dataset.guildSearch.includes(query);
                card.hidden = !matches;
                if (matches) visible += 1;
              });
              count.textContent = visible + " guild" + (visible === 1 ? "" : "s");
              empty.hidden = visible !== 0;
            };
            search.addEventListener("input", filter);
          })();
        </script>
      `, {
        seo: {
          title: `${realm.name} Guilds and Rosters | FrozenThrone`,
          description: `Browse ${realm.name} guilds, Guild Masters, member rosters, classes, ranks, online activity, and public character Armory profiles.`,
          url: "https://frozenthrone.co/guilds",
          structuredData: [{
            "@type": "CollectionPage",
            name: `${realm.name} Guild Directory`,
            url: "https://frozenthrone.co/guilds",
            numberOfItems: guilds.length
          }]
        }
      });
    } catch (err) {
      console.error("guild directory failed", err);
      render(req, res, "Guilds Error", errorCard("The Guild Hall could not load. Check the website logs for the database error."));
    } finally {
      try { if (conn) await conn.end(); } catch {}
    }
  });

  app.get("/guilds/:guildId", async (req, res) => {
    const guildId = Number(req.params.guildId);
    if (!Number.isInteger(guildId) || guildId <= 0) {
      res.status(400);
      return render(req, res, "Guild Not Found", errorCard("That guild address is not valid."));
    }

    let conn;
    try {
      const realm = getActiveRealm(req);
      conn = await characterDb(realm);
      const [guildRows] = await conn.execute(`
        SELECT
          g.guildid,
          g.name,
          g.leaderguid,
          g.EmblemStyle,
          g.EmblemColor,
          g.BorderStyle,
          g.BorderColor,
          g.BackgroundColor,
          g.info,
          g.motd,
          g.createdate,
          leader.name AS leaderName,
          leader.race AS leaderRace,
          leader.class AS leaderClass,
          leader.level AS leaderLevel
        FROM guild g
        LEFT JOIN characters leader ON leader.guid = g.leaderguid
        WHERE g.guildid = ?
        LIMIT 1
      `, [guildId]);

      const guild = guildRows[0];
      if (!guild) {
        res.status(404);
        return render(req, res, "Guild Not Found", errorCard(`No guild with that ID exists on ${realm.name}.`));
      }

      const [members] = await conn.execute(`
        SELECT
          c.guid,
          c.name,
          c.race,
          c.class,
          c.level,
          c.money,
          c.online,
          c.totalKills,
          c.totaltime,
          c.logout_time,
          gm.rank AS rankId,
          COALESCE(gr.rname, CONCAT('Rank ', gm.rank)) AS rankName
        FROM guild_member gm
        JOIN characters c ON c.guid = gm.guid
        LEFT JOIN guild_rank gr ON gr.guildid = gm.guildid AND gr.rid = gm.rank
        WHERE gm.guildid = ?
          AND ${publicCharacterFilter(realm, "c")}
        ORDER BY c.online DESC, gm.rank ASC, c.level DESC, c.name ASC
      `, [guildId]);

      const now = Math.floor(Date.now() / 1000);
      const onlineCount = members.filter(member => numeric(member.online) === 1).length;
      const activeSevenDays = members.filter(member => numeric(member.online) === 1 || now - numeric(member.logout_time) <= 86400 * 7).length;
      const maxLevelCount = members.filter(member => numeric(member.level) >= 80).length;
      const averageLevel = members.length
        ? Math.round(members.reduce((sum, member) => sum + numeric(member.level), 0) / members.length)
        : 0;
      const totalKills = members.reduce((sum, member) => sum + numeric(member.totalKills), 0);
      const allianceCount = members.filter(member => ALLIANCE_RACES.has(numeric(member.race))).length;
      const hordeCount = members.filter(member => HORDE_RACES.has(numeric(member.race))).length;
      const faction = factionForCounts(allianceCount, hordeCount);

      const rankCounts = new Map();
      const classCounts = new Map();
      members.forEach(member => {
        const rank = member.rankName || `Rank ${member.rankId}`;
        rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);
        const playerClass = className(member.class);
        classCounts.set(playerClass, (classCounts.get(playerClass) || 0) + 1);
      });
      const largestClass = Math.max(1, ...classCounts.values());

      const rankBadges = [...rankCounts.entries()].map(([rank, count]) =>
        `<span class="guild-rank-chip"><strong>${esc(rank)}</strong><span>${esc(count)}</span></span>`
      ).join("");
      const classBars = [...classCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([playerClass, count]) => `
          <div class="guild-class-row class-${esc(playerClass.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">
            <span>${esc(playerClass)}</span>
            <div><i style="width:${esc(Math.max(8, Math.round(count / largestClass * 100)))}%"></i></div>
            <strong>${esc(count)}</strong>
          </div>`).join("");

      const rosterRows = members.map(member => {
        const memberFaction = factionForRace(member.race);
        const isOnline = numeric(member.online) === 1;
        const searchText = `${member.name} ${member.rankName} ${raceName(member.race)} ${className(member.class)} ${memberFaction.label}`.toLowerCase();
        return `
          <tr data-roster-search="${esc(searchText)}" data-online="${isOnline ? "1" : "0"}">
            <td>
              <a class="guild-member-name class-${esc(classSlug(member.class))}" href="/armory/${esc(realm.key)}/${esc(member.guid)}">${esc(member.name)}</a>
              ${numeric(member.guid) === numeric(guild.leaderguid) ? `<span class="guild-master-tag">GM</span>` : ""}
            </td>
            <td>${esc(member.rankName || `Rank ${member.rankId}`)}</td>
            <td><span class="guild-faction-mini faction-${memberFaction.key}">${esc(memberFaction.label)}</span></td>
            <td>${esc(raceName(member.race))}</td>
            <td>${esc(className(member.class))}</td>
            <td>${esc(member.level)}</td>
            <td><span class="${isOnline ? "online" : "offline"}">${isOnline ? "● Online" : "○ Offline"}</span></td>
            <td>${esc(numeric(member.totalKills).toLocaleString("en-US"))}</td>
            <td>${esc(formatPlaytime(member.totaltime))}</td>
            <td>${esc(formatLastSeen(member.logout_time, isOnline))}</td>
          </tr>`;
      }).join("");

      render(req, res, `${guild.name} Guild | ${realm.name}`, `
        <main class="container guild-page guild-profile-page">
          <section>
            <nav class="guild-breadcrumb" aria-label="Breadcrumb">
              <a href="/guilds">Guild Hall</a><span>›</span><span>&lt;${esc(guild.name)}&gt;</span>
            </nav>

            <header class="guild-profile-hero faction-${faction.key}">
              ${guildMark(guild.name, guild.guildid)}
              <div class="guild-profile-title">
                <p class="eyebrow">${esc(realm.name)} Guild Profile</p>
                <h1>&lt;${esc(guild.name)}&gt;</h1>
                <div class="guild-profile-tags">
                  <span class="guild-faction faction-${faction.key}">${faction.icon} ${faction.label}</span>
                  <span>Guild ID ${esc(guild.guildid)}</span>
                  <span>Founded ${esc(formatDate(guild.createdate))}</span>
                </div>
                <p class="guild-profile-motd">“${safeGuildText(guild.motd, "No message of the day has been set.")}”</p>
              </div>
              <div class="guild-leader-card">
                <span>Guild Master</span>
                <strong>${esc(guild.leaderName || "Unknown")}</strong>
                <small>${guild.leaderName ? `Level ${esc(guild.leaderLevel)} ${esc(raceName(guild.leaderRace))} ${esc(className(guild.leaderClass))}` : "Leader character unavailable"}</small>
                ${guild.leaderName ? `<a href="/armory/${esc(realm.key)}/${esc(guild.leaderguid)}">View Armory →</a>` : ""}
              </div>
            </header>

            <div class="guild-summary-grid guild-profile-stats">
              <div><span>Members</span><strong>${esc(members.length)}</strong></div>
              <div><span>Online</span><strong class="online">${esc(onlineCount)}</strong></div>
              <div><span>Active 7 Days</span><strong>${esc(activeSevenDays)}</strong></div>
              <div><span>Level 80</span><strong>${esc(maxLevelCount)}</strong></div>
              <div><span>Average Level</span><strong>${esc(averageLevel)}</strong></div>
              <div><span>Total Honorable Kills</span><strong>${esc(totalKills.toLocaleString("en-US"))}</strong></div>
            </div>

            <div class="guild-profile-layout">
              <div class="guild-profile-main">
                <section class="guild-panel guild-about-panel">
                  <div class="guild-panel-heading"><div><p class="eyebrow">About the Guild</p><h2>Guild Information</h2></div></div>
                  <p>${safeGuildText(guild.info, "This guild has not added a public description yet.")}</p>
                </section>

                <section class="guild-panel guild-roster-panel">
                  <div class="guild-panel-heading">
                    <div><p class="eyebrow">Live Realm Data</p><h2>Guild Roster</h2></div>
                    <span id="guild-roster-count">${esc(members.length)} member${members.length === 1 ? "" : "s"}</span>
                  </div>
                  <div class="guild-roster-tools">
                    <input id="guild-roster-search" type="search" placeholder="Search members, ranks, race, or class" autocomplete="off">
                    <label><input id="guild-online-only" type="checkbox"> Online only</label>
                  </div>
                  <div class="table-wrap">
                    <table class="data-table guild-roster-table">
                      <thead><tr><th>Member</th><th>Rank</th><th>Faction</th><th>Race</th><th>Class</th><th>Level</th><th>Status</th><th>Kills</th><th>Played</th><th>Last Seen</th></tr></thead>
                      <tbody>${rosterRows || `<tr><td colspan="10">No public members were found.</td></tr>`}</tbody>
                    </table>
                  </div>
                  <div class="guild-empty-state" id="guild-roster-empty" hidden><p>No members match those filters.</p></div>
                </section>
              </div>

              <aside class="guild-profile-side">
                <section class="guild-panel">
                  <p class="eyebrow">Guild Structure</p>
                  <h2>Ranks</h2>
                  <div class="guild-rank-list">${rankBadges || `<p class="muted">No ranks found.</p>`}</div>
                </section>
                <section class="guild-panel">
                  <p class="eyebrow">Roster Balance</p>
                  <h2>Class Composition</h2>
                  <div class="guild-class-list">${classBars || `<p class="muted">No class data found.</p>`}</div>
                </section>
                <section class="guild-panel guild-privacy-note">
                  <p class="eyebrow">Public Armory</p>
                  <h2>What Is Shown</h2>
                  <p>Public character and guild activity is displayed here. Account IDs, officer notes, member notes, guild bank contents, and private account data stay hidden.</p>
                </section>
              </aside>
            </div>
          </section>
        </main>
        <script>
          (() => {
            const search = document.getElementById("guild-roster-search");
            const onlineOnly = document.getElementById("guild-online-only");
            const rows = [...document.querySelectorAll(".guild-roster-table tbody tr[data-roster-search]")];
            const count = document.getElementById("guild-roster-count");
            const empty = document.getElementById("guild-roster-empty");
            if (!search || !onlineOnly) return;
            const filter = () => {
              const query = search.value.trim().toLowerCase();
              let visible = 0;
              rows.forEach(row => {
                const matchesSearch = !query || row.dataset.rosterSearch.includes(query);
                const matchesOnline = !onlineOnly.checked || row.dataset.online === "1";
                const matches = matchesSearch && matchesOnline;
                row.hidden = !matches;
                if (matches) visible += 1;
              });
              count.textContent = visible + " member" + (visible === 1 ? "" : "s");
              empty.hidden = visible !== 0;
            };
            search.addEventListener("input", filter);
            onlineOnly.addEventListener("change", filter);
          })();
        </script>
      `, {
        seo: {
          title: `${guild.name} Guild Roster | ${realm.name} | FrozenThrone`,
          description: `View the ${guild.name} guild on ${realm.name}: Guild Master ${guild.leaderName || "Unknown"}, ${members.length} members, ranks, classes, online activity, and public Armory profiles.`,
          url: `https://frozenthrone.co/guilds/${guild.guildid}`,
          structuredData: [{
            "@type": "Organization",
            "@id": `https://frozenthrone.co/guilds/${guild.guildid}#guild`,
            name: guild.name,
            description: String(guild.info || guild.motd || `${realm.name} guild`).trim(),
            url: `https://frozenthrone.co/guilds/${guild.guildid}`,
            parentOrganization: { "@id": "https://frozenthrone.co/#organization" }
          }]
        }
      });
    } catch (err) {
      console.error("guild profile failed", err);
      render(req, res, "Guild Error", errorCard("That guild profile could not load. Check the website logs for the database error."));
    } finally {
      try { if (conn) await conn.end(); } catch {}
    }
  });
};
