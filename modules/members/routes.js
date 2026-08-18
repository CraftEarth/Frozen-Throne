const crypto = require("crypto");

module.exports = function registerMemberRoutes(app, deps) {
  const {
    render,
    errorCard,
    esc,
    authDb,
    characterDb,
    requireLogin,
    className,
    raceName,
    moneyToGold,
    realms
  } = deps;

  let tablesReady;

  function normalizeUsername(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 32);
  }

  function formatDate(value) {
    if (!value) return "Unknown";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function formatPlaytime(seconds) {
    const total = Math.max(0, Number(seconds || 0));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function validCsrf(req) {
    const expected = String(req.user?.csrfToken || "");
    const supplied = String(req.body?._csrf || "");

    if (!expected || !supplied || expected.length !== supplied.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(supplied)
    );
  }

  function pairFor(first, second) {
    return [first, second].sort((a, b) => a.localeCompare(b));
  }

  function realmLabel(key) {
    return key === "shadowmourne" ? "Shadowmourne" : "FrozenThrone";
  }

  function ensureTables() {
    if (!tablesReady) {
      tablesReady = (async () => {
        const conn = await authDb("main");

        try {
          await conn.execute(`
            CREATE TABLE IF NOT EXISTS frozenthrone.member_profiles (
              username VARCHAR(32) NOT NULL,
              bio VARCHAR(500) NOT NULL DEFAULT '',
              main_realm_key VARCHAR(32) NULL,
              main_character_guid BIGINT UNSIGNED NULL,
              is_public TINYINT(1) NOT NULL DEFAULT 1,
              show_roster TINYINT(1) NOT NULL DEFAULT 1,
              show_online TINYINT(1) NOT NULL DEFAULT 1,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (username)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
              COLLATE=utf8mb4_unicode_ci
          `);

          await conn.execute(`
            CREATE TABLE IF NOT EXISTS frozenthrone.member_friendships (
              id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
              member_low VARCHAR(32) NOT NULL,
              member_high VARCHAR(32) NOT NULL,
              requester_username VARCHAR(32) NOT NULL,
              addressee_username VARCHAR(32) NOT NULL,
              status ENUM('pending','accepted','declined')
                NOT NULL DEFAULT 'pending',
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              responded_at TIMESTAMP NULL DEFAULT NULL,
              PRIMARY KEY (id),
              UNIQUE KEY uq_friend_pair (member_low, member_high),
              KEY idx_friend_requester (requester_username, status),
              KEY idx_friend_addressee (addressee_username, status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
              COLLATE=utf8mb4_unicode_ci
          `);
        } finally {
          await conn.end();
        }
      })();
    }

    return tablesReady;
  }

  async function ensureProfile(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) return null;

    await ensureTables();

    const conn = await authDb("main");

    try {
      await conn.execute(`
        INSERT IGNORE INTO frozenthrone.member_profiles (username)
        VALUES (?)
      `, [normalized]);

      const [rows] = await conn.execute(`
        SELECT username, bio, main_realm_key, main_character_guid,
               is_public, show_roster, show_online,
               created_at, updated_at
        FROM frozenthrone.member_profiles
        WHERE username = ?
        LIMIT 1
      `, [normalized]);

      return rows[0] || null;
    } finally {
      await conn.end();
    }
  }

  async function syncTavernMembers() {
    const conn = await authDb("main");

    try {
      await conn.execute(`
        INSERT IGNORE INTO frozenthrone.member_profiles (username)
        SELECT DISTINCT UPPER(username)
        FROM frozenthrone.member_wall_messages
        WHERE deleted_at IS NULL
          AND username <> ''
      `);
    } catch (error) {
      console.warn("Tavern member sync skipped:", error.message);
    } finally {
      await conn.end();
    }
  }

  async function loadRosters(username) {
    const normalized = normalizeUsername(username);
    const roster = [];

    for (const realm of realms.filter(item => item.public !== false)) {
      let authConn;
      let charConn;

      try {
        authConn = await authDb(realm);

        const [accounts] = await authConn.execute(`
          SELECT id
          FROM account
          WHERE UPPER(username) = ?
          LIMIT 1
        `, [normalized]);

        if (!accounts.length) continue;

        charConn = await characterDb(realm);

        const [characters] = await charConn.execute(`
          SELECT guid, name, race, class, level, money, online,
                 totaltime, totalKills, totalHonorPoints, arenaPoints
          FROM characters
          WHERE account = ?
            AND (deleteDate IS NULL OR deleteDate = 0)
          ORDER BY level DESC, name ASC
        `, [Number(accounts[0].id)]);

        characters.forEach(character => {
          roster.push({
            ...character,
            realmKey: realm.key,
            realmName: realm.name
          });
        });
      } catch (error) {
        console.warn(
          `Member roster lookup failed for ${realm.key}:`,
          error.message
        );
      } finally {
        if (charConn) {
          try { await charConn.end(); } catch {}
        }

        if (authConn) {
          try { await authConn.end(); } catch {}
        }
      }
    }

    return roster;
  }

  async function getRelationship(first, second) {
    if (!first || !second || first === second) return null;

    const [low, high] = pairFor(first, second);
    const conn = await authDb("main");

    try {
      const [rows] = await conn.execute(`
        SELECT id, requester_username, addressee_username,
               status, created_at, responded_at
        FROM frozenthrone.member_friendships
        WHERE member_low = ?
          AND member_high = ?
        LIMIT 1
      `, [low, high]);

      return rows[0] || null;
    } finally {
      await conn.end();
    }
  }

  function friendControls(req, target, relationship) {
    if (!req.user) {
      return `
        <a class="member-action" href="/login?next=${encodeURIComponent(`/members/${target}`)}">
          Login to Add Friend
        </a>
      `;
    }

    const current = normalizeUsername(req.user.username);

    if (current === target) {
      return `
        <a class="member-action secondary" href="/friends">
          Manage Friends
        </a>
      `;
    }

    const csrf = esc(req.user.csrfToken || "");

    if (!relationship) {
      return `
        <form method="POST" action="/members/${esc(target)}/friend">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="member-action" type="submit">Add Friend</button>
        </form>
      `;
    }

    if (relationship.status === "accepted") {
      return `
        <span class="member-relationship accepted">✓ Friends</span>

        <form method="POST" action="/friends/${esc(target)}/remove">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="member-action secondary" type="submit">
            Remove Friend
          </button>
        </form>
      `;
    }

    if (
      relationship.status === "pending" &&
      relationship.addressee_username === current
    ) {
      return `
        <span class="member-relationship incoming">
          Friend request received
        </span>

        <form method="POST" action="/friends/${Number(relationship.id)}/respond">
          <input type="hidden" name="_csrf" value="${csrf}">
          <input type="hidden" name="decision" value="accept">
          <button class="member-action" type="submit">Accept</button>
        </form>

        <form method="POST" action="/friends/${Number(relationship.id)}/respond">
          <input type="hidden" name="_csrf" value="${csrf}">
          <input type="hidden" name="decision" value="decline">
          <button class="member-action secondary" type="submit">Decline</button>
        </form>
      `;
    }

    if (relationship.status === "pending") {
      return `
        <span class="member-relationship pending">Request Pending</span>

        <form method="POST" action="/friends/${esc(target)}/remove">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="member-action secondary" type="submit">
            Cancel Request
          </button>
        </form>
      `;
    }

    return `
      <form method="POST" action="/members/${esc(target)}/friend">
        <input type="hidden" name="_csrf" value="${csrf}">
        <button class="member-action" type="submit">Send New Request</button>
      </form>
    `;
  }

  app.get("/members", async (req, res) => {
    let conn;

    try {
      await ensureTables();

      if (req.user) {
        await ensureProfile(req.user.username);
      }

      await syncTavernMembers();

      const search = normalizeUsername(req.query.search || "");
      const current = normalizeUsername(req.user?.username || "");

      conn = await authDb("main");

      const [members] = await conn.execute(`
        SELECT
          p.username,
          p.bio,
          p.created_at,
          p.main_realm_key,
          p.is_public,
          (
            SELECT COUNT(*)
            FROM frozenthrone.member_friendships f
            WHERE f.status = 'accepted'
              AND (
                f.requester_username = p.username OR
                f.addressee_username = p.username
              )
          ) AS friend_count
        FROM frozenthrone.member_profiles p
        WHERE (p.is_public = 1 OR p.username = ?)
          AND p.username LIKE ?
        ORDER BY p.updated_at DESC, p.username ASC
        LIMIT 100
      `, [current, `%${search}%`]);

      const cards = members.map(member => `
        <a class="member-directory-card" href="/members/${encodeURIComponent(member.username)}">
          <span class="member-directory-avatar">
            ${esc(member.username.slice(0, 1))}
          </span>

          <div>
            <strong>${esc(member.username)}</strong>
            <span>
              ${esc(realmLabel(member.main_realm_key || "main"))}
              · ${Number(member.friend_count || 0)} friend${Number(member.friend_count || 0) === 1 ? "" : "s"}
            </span>
            <p>${esc(member.bio || "This member has not written a profile bio yet.")}</p>
          </div>
        </a>
      `).join("");

      render(req, res, "Members", `
        <link rel="stylesheet" href="/css/members.css?v=1">

        <main class="container members-page">
          <section>
            <header class="members-titlebar">
              <div>
                <p class="eyebrow">FrozenThrone Community</p>
                <h1>Member Directory</h1>
                <p>Find players, view their public characters and build your friends list.</p>
              </div>

              ${req.user ? `
                <div class="members-title-actions">
                  <a class="member-action" href="/members/${encodeURIComponent(current)}">My Profile</a>
                  <a class="member-action secondary" href="/friends">Friends & Requests</a>
                </div>
              ` : ""}
            </header>

            <form class="member-search" method="GET" action="/members">
              <input
                name="search"
                value="${esc(search)}"
                maxlength="32"
                placeholder="Search members by username"
              >
              <button type="submit">Search Members</button>
            </form>

            <div class="member-directory-grid">
              ${cards || `
                <div class="member-directory-empty">
                  <strong>Waiting for members…</strong>
                  <p>Member profiles will appear here as players join the community.</p>
                </div>
              `}
            </div>
          </section>
        </main>
      `);
    } catch (error) {
      console.error("Member directory failed:", error);
      render(req, res, "Members", errorCard("The member directory could not be loaded."));
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  app.get("/members/:username", async (req, res) => {
    const target = normalizeUsername(req.params.username);
    const current = normalizeUsername(req.user?.username || "");
    const isOwner = Boolean(current && current === target);

    if (!target) {
      return render(req, res, "Member Profile", errorCard("Invalid member username."));
    }

    let conn;

    try {
      await ensureTables();

      if (req.user) {
        await ensureProfile(current);
      }

      let profile;

      conn = await authDb("main");

      const [profiles] = await conn.execute(`
        SELECT username, bio, main_realm_key, main_character_guid,
               is_public, show_roster, show_online,
               created_at, updated_at
        FROM frozenthrone.member_profiles
        WHERE username = ?
        LIMIT 1
      `, [target]);

      profile = profiles[0] || null;

      if (!profile && isOwner) {
        profile = await ensureProfile(target);
      }

      if (!profile) {
        return render(
          req,
          res,
          "Member Profile",
          errorCard("That member has not created a public website profile yet.")
        );
      }

      if (!Number(profile.is_public) && !isOwner) {
        return render(req, res, "Private Profile", `
          <link rel="stylesheet" href="/css/members.css?v=1">

          <main class="container members-page">
            <section>
              <div class="member-private">
                <span>${esc(target.slice(0, 1))}</span>
                <h1>${esc(target)}</h1>
                <p>This member has chosen to keep their profile private.</p>
                <a class="member-action secondary" href="/members">Back to Members</a>
              </div>
            </section>
          </main>
        `);
      }

      const roster = await loadRosters(target);
      const relationship = current
        ? await getRelationship(current, target)
        : null;

      const [friendRows] = await conn.execute(`
        SELECT
          CASE
            WHEN requester_username = ? THEN addressee_username
            ELSE requester_username
          END AS friend_username
        FROM frozenthrone.member_friendships
        WHERE status = 'accepted'
          AND (requester_username = ? OR addressee_username = ?)
        ORDER BY responded_at DESC, id DESC
        LIMIT 24
      `, [target, target, target]);

      let wallMessages = [];

      try {
        const [rows] = await conn.execute(`
          SELECT body, realm_key, created_at
          FROM frozenthrone.member_wall_messages
          WHERE UPPER(username) = ?
            AND deleted_at IS NULL
          ORDER BY id DESC
          LIMIT 5
        `, [target]);

        wallMessages = rows;
      } catch {}

      const totals = roster.reduce((summary, character) => {
        summary.levels += Number(character.level || 0);
        summary.gold += Number(character.money || 0);
        summary.playtime += Number(character.totaltime || 0);
        summary.kills += Number(character.totalKills || 0);
        summary.online += Number(character.online || 0) === 1 ? 1 : 0;
        return summary;
      }, {
        levels: 0,
        gold: 0,
        playtime: 0,
        kills: 0,
        online: 0
      });

      const mainCharacter =
        roster.find(character =>
          String(character.realmKey) === String(profile.main_realm_key) &&
          Number(character.guid) === Number(profile.main_character_guid)
        ) ||
        roster[0] ||
        null;

      const rosterRows = roster.map(character => `
        <tr>
          <td>
            <a href="/armory/${esc(character.realmKey)}/${Number(character.guid)}">
              <strong>${esc(character.name)}</strong>
              <small>${esc(character.realmName)}</small>
            </a>
          </td>
          <td>${esc(raceName(character.race))}</td>
          <td>${esc(className(character.class))}</td>
          <td><strong>${Number(character.level || 0)}</strong></td>
          <td>${esc(moneyToGold(character.money))}g</td>
          <td>${esc(formatPlaytime(character.totaltime))}</td>
          <td>${Number(character.totalKills || 0).toLocaleString()}</td>
          <td>
            ${Number(profile.show_online)
              ? (Number(character.online)
                ? `<span class="member-online">Online</span>`
                : `<span class="member-offline">Offline</span>`)
              : `<span class="member-offline">Hidden</span>`}
          </td>
          <td>
            <a class="member-table-link" href="/armory/${esc(character.realmKey)}/${Number(character.guid)}">
              Armory
            </a>
          </td>
        </tr>
      `).join("");

      const friendCards = friendRows.map(friend => `
        <a class="member-friend-chip" href="/members/${encodeURIComponent(friend.friend_username)}">
          <span>${esc(friend.friend_username.slice(0, 1))}</span>
          <strong>${esc(friend.friend_username)}</strong>
        </a>
      `).join("");

      const wallCards = wallMessages.map(message => `
        <article class="member-profile-message">
          <p>${esc(message.body)}</p>
          <span>${esc(realmLabel(message.realm_key))} · ${esc(formatDate(message.created_at))}</span>
        </article>
      `).join("");

      const characterOptions = roster.map(character => {
        const value = `${character.realmKey}:${Number(character.guid)}`;
        const selected =
          String(character.realmKey) === String(profile.main_realm_key) &&
          Number(character.guid) === Number(profile.main_character_guid);

        return `
          <option value="${esc(value)}" ${selected ? "selected" : ""}>
            ${esc(character.name)} — Level ${Number(character.level)} ${esc(className(character.class))} (${esc(character.realmName)})
          </option>
        `;
      }).join("");

      render(req, res, `${target} - Member Profile`, `
        <link rel="stylesheet" href="/css/members.css?v=1">

        <main class="container members-page">
          <section>
            <article class="member-profile-hero">
              <div class="member-profile-avatar">
                ${esc(target.slice(0, 1))}
              </div>

              <div class="member-profile-heading">
                <p class="eyebrow">FrozenThrone Member</p>
                <h1>${esc(target)}</h1>

                <p class="member-profile-main">
                  ${mainCharacter
                    ? `Main Character:
                       <a href="/armory/${esc(mainCharacter.realmKey)}/${Number(mainCharacter.guid)}">
                         ${esc(mainCharacter.name)}
                       </a>
                       · Level ${Number(mainCharacter.level)}
                       ${esc(className(mainCharacter.class))}
                       · ${esc(mainCharacter.realmName)}`
                    : "No main character selected yet."}
                </p>

                <p class="member-profile-bio">
                  ${esc(profile.bio || "This member has not written a profile bio yet.")}
                </p>
              </div>

              <div class="member-profile-actions">
                ${friendControls(req, target, relationship)}
                <a class="member-action secondary" href="/members">All Members</a>
              </div>
            </article>

            <div class="member-stat-grid">
              <article><span>Characters</span><strong>${roster.length}</strong></article>
              <article><span>Combined Levels</span><strong>${totals.levels.toLocaleString()}</strong></article>
              <article><span>Combined Gold</span><strong>${esc(moneyToGold(totals.gold))}g</strong></article>
              <article><span>Playtime</span><strong>${esc(formatPlaytime(totals.playtime))}</strong></article>
              <article><span>Total Kills</span><strong>${totals.kills.toLocaleString()}</strong></article>
              <article>
                <span>Online</span>
                <strong>${Number(profile.show_online) ? totals.online : "Private"}</strong>
              </article>
              <article><span>Friends</span><strong>${friendRows.length}</strong></article>
              <article><span>Member Since</span><strong class="member-stat-date">${esc(formatDate(profile.created_at))}</strong></article>
            </div>

            ${Number(profile.show_roster) || isOwner ? `
              <article class="member-panel">
                <header>
                  <div>
                    <p class="eyebrow">Public Characters</p>
                    <h2>Character Roster</h2>
                  </div>
                  <span>${roster.length} characters across ${new Set(roster.map(item => item.realmKey)).size} realm${new Set(roster.map(item => item.realmKey)).size === 1 ? "" : "s"}</span>
                </header>

                ${roster.length ? `
                  <div class="member-table-wrap">
                    <table class="member-table">
                      <thead>
                        <tr>
                          <th>Character</th>
                          <th>Race</th>
                          <th>Class</th>
                          <th>Level</th>
                          <th>Gold</th>
                          <th>Played</th>
                          <th>Kills</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>${rosterRows}</tbody>
                    </table>
                  </div>
                ` : `
                  <div class="member-panel-empty">
                    No characters are currently connected to this member profile.
                  </div>
                `}
              </article>
            ` : `
              <article class="member-panel">
                <div class="member-panel-empty">
                  This member has chosen to keep their character roster private.
                </div>
              </article>
            `}

            <div class="member-profile-columns">
              <article class="member-panel">
                <header>
                  <div>
                    <p class="eyebrow">Community</p>
                    <h2>Friends</h2>
                  </div>
                </header>

                <div class="member-friend-grid">
                  ${friendCards || `
                    <div class="member-panel-empty">
                      Waiting for the first friendship…
                    </div>
                  `}
                </div>
              </article>

              <article class="member-panel">
                <header>
                  <div>
                    <p class="eyebrow">The Tavern</p>
                    <h2>Recent Messages</h2>
                  </div>
                </header>

                <div class="member-profile-messages">
                  ${wallCards || `
                    <div class="member-panel-empty">
                      Waiting on a message from ${esc(target)}…
                    </div>
                  `}
                </div>
              </article>
            </div>

            ${isOwner ? `
              <article class="member-panel member-settings">
                <header>
                  <div>
                    <p class="eyebrow">Profile Owner Controls</p>
                    <h2>Edit My Public Profile</h2>
                  </div>
                </header>

                <form method="POST" action="/members/profile">
                  <input type="hidden" name="_csrf" value="${esc(req.user.csrfToken || "")}">

                  <label for="member-bio">Profile Bio</label>
                  <textarea
                    id="member-bio"
                    name="bio"
                    maxlength="500"
                    placeholder="Tell the community about yourself, your characters or what you enjoy doing in FrozenThrone."
                  >${esc(profile.bio || "")}</textarea>

                  <label for="member-main-character">Main Character</label>
                  <select id="member-main-character" name="mainCharacter">
                    <option value="">No main character selected</option>
                    ${characterOptions}
                  </select>

                  <div class="member-privacy-options">
                    <label>
                      <input
                        type="checkbox"
                        name="isPublic"
                        value="1"
                        ${Number(profile.is_public) ? "checked" : ""}
                      >
                      Public member profile
                    </label>

                    <label>
                      <input
                        type="checkbox"
                        name="showRoster"
                        value="1"
                        ${Number(profile.show_roster) ? "checked" : ""}
                      >
                      Show my character roster
                    </label>

                    <label>
                      <input
                        type="checkbox"
                        name="showOnline"
                        value="1"
                        ${Number(profile.show_online) ? "checked" : ""}
                      >
                      Show character online status
                    </label>
                  </div>

                  <button class="member-action" type="submit">
                    Save Profile
                  </button>
                </form>
              </article>
            ` : ""}
          </section>
        </main>
      `);
    } catch (error) {
      console.error("Member profile failed:", error);
      render(req, res, "Member Profile", errorCard("The member profile could not be loaded."));
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  app.post("/members/profile", requireLogin, async (req, res) => {
    if (!validCsrf(req)) {
      return res.status(403).send("Invalid or expired form token.");
    }

    const username = normalizeUsername(req.user.username);
    const bio = String(req.body.bio || "")
      .replace(/\r/g, "")
      .trim()
      .slice(0, 500);

    const roster = await loadRosters(username);
    const requestedMain = String(req.body.mainCharacter || "");
    let mainRealm = null;
    let mainGuid = null;

    if (requestedMain.includes(":")) {
      const [realmKey, rawGuid] = requestedMain.split(":");
      const guid = Number(rawGuid);

      const found = roster.find(character =>
        character.realmKey === realmKey &&
        Number(character.guid) === guid
      );

      if (found) {
        mainRealm = found.realmKey;
        mainGuid = Number(found.guid);
      }
    }

    let conn;

    try {
      await ensureProfile(username);
      conn = await authDb("main");

      await conn.execute(`
        UPDATE frozenthrone.member_profiles
        SET bio = ?,
            main_realm_key = ?,
            main_character_guid = ?,
            is_public = ?,
            show_roster = ?,
            show_online = ?
        WHERE username = ?
      `, [
        bio,
        mainRealm,
        mainGuid,
        req.body.isPublic === "1" ? 1 : 0,
        req.body.showRoster === "1" ? 1 : 0,
        req.body.showOnline === "1" ? 1 : 0,
        username
      ]);

      res.redirect(`/members/${encodeURIComponent(username)}`);
    } catch (error) {
      console.error("Member profile save failed:", error);
      render(req, res, "Profile Error", errorCard("Your profile settings could not be saved."));
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  app.post("/members/:username/friend", requireLogin, async (req, res) => {
    if (!validCsrf(req)) {
      return res.status(403).send("Invalid or expired form token.");
    }

    const current = normalizeUsername(req.user.username);
    const target = normalizeUsername(req.params.username);

    if (!target || target === current) {
      return res.redirect(`/members/${encodeURIComponent(current)}`);
    }

    let conn;

    try {
      await ensureProfile(current);

      conn = await authDb("main");

      const [targets] = await conn.execute(`
        SELECT username
        FROM frozenthrone.member_profiles
        WHERE username = ?
        LIMIT 1
      `, [target]);

      if (!targets.length) {
        return render(req, res, "Friend Request", errorCard("That member profile does not exist."));
      }

      const [low, high] = pairFor(current, target);

      const [relationships] = await conn.execute(`
        SELECT id, requester_username, addressee_username, status
        FROM frozenthrone.member_friendships
        WHERE member_low = ?
          AND member_high = ?
        LIMIT 1
      `, [low, high]);

      const existing = relationships[0];

      if (
        existing &&
        existing.status === "pending" &&
        existing.addressee_username === current
      ) {
        await conn.execute(`
          UPDATE frozenthrone.member_friendships
          SET status = 'accepted',
              responded_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [Number(existing.id)]);
      } else if (!existing) {
        await conn.execute(`
          INSERT INTO frozenthrone.member_friendships
            (member_low, member_high, requester_username, addressee_username)
          VALUES (?, ?, ?, ?)
        `, [low, high, current, target]);
      } else if (existing.status !== "accepted") {
        await conn.execute(`
          UPDATE frozenthrone.member_friendships
          SET requester_username = ?,
              addressee_username = ?,
              status = 'pending',
              created_at = CURRENT_TIMESTAMP,
              responded_at = NULL
          WHERE id = ?
        `, [current, target, Number(existing.id)]);
      }

      res.redirect(`/members/${encodeURIComponent(target)}`);
    } catch (error) {
      console.error("Friend request failed:", error);
      render(req, res, "Friend Request", errorCard("The friend request could not be sent."));
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  app.get("/friends", requireLogin, async (req, res) => {
    const current = normalizeUsername(req.user.username);
    let conn;

    try {
      await ensureProfile(current);
      conn = await authDb("main");

      const [relationships] = await conn.execute(`
        SELECT id, requester_username, addressee_username,
               status, created_at, responded_at
        FROM frozenthrone.member_friendships
        WHERE requester_username = ?
           OR addressee_username = ?
        ORDER BY
          CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
          created_at DESC
      `, [current, current]);

      const incoming = relationships.filter(item =>
        item.status === "pending" &&
        item.addressee_username === current
      );

      const outgoing = relationships.filter(item =>
        item.status === "pending" &&
        item.requester_username === current
      );

      const accepted = relationships.filter(item =>
        item.status === "accepted"
      );

      const csrf = esc(req.user.csrfToken || "");

      const incomingCards = incoming.map(item => `
        <article class="friend-request-card">
          <a href="/members/${encodeURIComponent(item.requester_username)}">
            <span>${esc(item.requester_username.slice(0, 1))}</span>
            <strong>${esc(item.requester_username)}</strong>
          </a>

          <div>
            <form method="POST" action="/friends/${Number(item.id)}/respond">
              <input type="hidden" name="_csrf" value="${csrf}">
              <input type="hidden" name="decision" value="accept">
              <button class="member-action" type="submit">Accept</button>
            </form>

            <form method="POST" action="/friends/${Number(item.id)}/respond">
              <input type="hidden" name="_csrf" value="${csrf}">
              <input type="hidden" name="decision" value="decline">
              <button class="member-action secondary" type="submit">Decline</button>
            </form>
          </div>
        </article>
      `).join("");

      const friendCards = accepted.map(item => {
        const friend =
          item.requester_username === current
            ? item.addressee_username
            : item.requester_username;

        return `
          <article class="friend-request-card">
            <a href="/members/${encodeURIComponent(friend)}">
              <span>${esc(friend.slice(0, 1))}</span>
              <strong>${esc(friend)}</strong>
            </a>

            <form method="POST" action="/friends/${encodeURIComponent(friend)}/remove">
              <input type="hidden" name="_csrf" value="${csrf}">
              <button class="member-action secondary" type="submit">Remove</button>
            </form>
          </article>
        `;
      }).join("");

      const outgoingCards = outgoing.map(item => `
        <article class="friend-request-card">
          <a href="/members/${encodeURIComponent(item.addressee_username)}">
            <span>${esc(item.addressee_username.slice(0, 1))}</span>
            <strong>${esc(item.addressee_username)}</strong>
          </a>

          <form method="POST" action="/friends/${encodeURIComponent(item.addressee_username)}/remove">
            <input type="hidden" name="_csrf" value="${csrf}">
            <button class="member-action secondary" type="submit">Cancel</button>
          </form>
        </article>
      `).join("");

      render(req, res, "Friends", `
        <link rel="stylesheet" href="/css/members.css?v=1">

        <main class="container members-page">
          <section>
            <header class="members-titlebar">
              <div>
                <p class="eyebrow">FrozenThrone Community</p>
                <h1>Friends & Requests</h1>
                <p>Manage your website friends across both FrozenThrone realms.</p>
              </div>

              <div class="members-title-actions">
                <a class="member-action" href="/members/${encodeURIComponent(current)}">My Profile</a>
                <a class="member-action secondary" href="/members">Find Members</a>
              </div>
            </header>

            <div class="friend-page-grid">
              <article class="member-panel">
                <header>
                  <div>
                    <p class="eyebrow">Needs Your Attention</p>
                    <h2>Incoming Requests</h2>
                  </div>
                  <span>${incoming.length}</span>
                </header>

                <div class="friend-request-list">
                  ${incomingCards || `
                    <div class="member-panel-empty">
                      Waiting for a friend request…
                    </div>
                  `}
                </div>
              </article>

              <article class="member-panel">
                <header>
                  <div>
                    <p class="eyebrow">Connected Members</p>
                    <h2>My Friends</h2>
                  </div>
                  <span>${accepted.length}</span>
                </header>

                <div class="friend-request-list">
                  ${friendCards || `
                    <div class="member-panel-empty">
                      Your accepted friends will appear here.
                    </div>
                  `}
                </div>
              </article>

              <article class="member-panel">
                <header>
                  <div>
                    <p class="eyebrow">Awaiting Response</p>
                    <h2>Sent Requests</h2>
                  </div>
                  <span>${outgoing.length}</span>
                </header>

                <div class="friend-request-list">
                  ${outgoingCards || `
                    <div class="member-panel-empty">
                      You have no pending sent requests.
                    </div>
                  `}
                </div>
              </article>
            </div>
          </section>
        </main>
      `);
    } catch (error) {
      console.error("Friends page failed:", error);
      render(req, res, "Friends", errorCard("Your friends list could not be loaded."));
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  app.post("/friends/:id/respond", requireLogin, async (req, res) => {
    if (!validCsrf(req)) {
      return res.status(403).send("Invalid or expired form token.");
    }

    const id = Number(req.params.id);
    const current = normalizeUsername(req.user.username);
    const decision = req.body.decision === "accept" ? "accepted" : "declined";

    if (!Number.isInteger(id) || id <= 0) {
      return res.redirect("/friends");
    }

    let conn;

    try {
      conn = await authDb("main");

      await conn.execute(`
        UPDATE frozenthrone.member_friendships
        SET status = ?,
            responded_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND addressee_username = ?
          AND status = 'pending'
      `, [decision, id, current]);

      res.redirect("/friends");
    } catch (error) {
      console.error("Friend response failed:", error);
      render(req, res, "Friends", errorCard("The friend request could not be updated."));
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  app.post("/friends/:username/remove", requireLogin, async (req, res) => {
    if (!validCsrf(req)) {
      return res.status(403).send("Invalid or expired form token.");
    }

    const current = normalizeUsername(req.user.username);
    const target = normalizeUsername(req.params.username);

    if (!target || target === current) {
      return res.redirect("/friends");
    }

    const [low, high] = pairFor(current, target);
    let conn;

    try {
      conn = await authDb("main");

      await conn.execute(`
        DELETE FROM frozenthrone.member_friendships
        WHERE member_low = ?
          AND member_high = ?
          AND (
            requester_username = ? OR
            addressee_username = ?
          )
      `, [low, high, current, current]);

      res.redirect("/friends");
    } catch (error) {
      console.error("Friend removal failed:", error);
      render(req, res, "Friends", errorCard("The friendship could not be removed."));
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  ensureTables().catch(error => {
    console.error("Member social tables failed to initialize:", error);
  });
};
