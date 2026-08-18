const crypto = require("crypto");

module.exports = function registerMemberPrivacyRoutes(app, deps) {
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

  const reservedHandles = new Set([
    "ADMIN",
    "ADMINISTRATOR",
    "MOD",
    "MODERATOR",
    "STAFF",
    "SYSTEM",
    "SERVER",
    "OWNER",
    "DEVELOPER",
    "SUPPORT",
    "FROZENTHRONE",
    "SHADOWMOURNE",
    "BLIZZARD",
    "GAME-MASTER",
    "GAMEMASTER",
    "GM"
  ]);

  function normalizeUsername(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 32);
  }

  function normalizeSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 24);
  }

  function validHandle(value) {
    return /^[A-Za-z0-9_-]{3,24}$/.test(String(value || ""));
  }

  function temporaryIdentity(username) {
    const digest = crypto
      .createHash("sha256")
      .update(`${username}|FrozenThrone-public-member`)
      .digest("hex")
      .slice(0, 8);

    const handle = `Member-${digest}`;

    return {
      handle,
      slug: handle.toLowerCase()
    };
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

    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function realmLabel(key) {
    return key === "shadowmourne" ? "Shadowmourne" : "FrozenThrone";
  }

  async function getProfileByUsername(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) return null;

    const identity = temporaryIdentity(normalized);
    const conn = await authDb("main");

    try {
      await conn.execute(`
        INSERT IGNORE INTO frozenthrone.member_profiles
          (username, public_handle, public_slug)
        VALUES (?, ?, ?)
      `, [normalized, identity.handle, identity.slug]);

      const [rows] = await conn.execute(`
        SELECT username, public_handle, public_slug, handle_changed_at,
               bio, main_realm_key, main_character_guid,
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

  async function getProfileBySlug(slug) {
    const normalized = normalizeSlug(slug);
    if (!normalized) return null;

    const conn = await authDb("main");

    try {
      const [rows] = await conn.execute(`
        SELECT username, public_handle, public_slug, handle_changed_at,
               bio, main_realm_key, main_character_guid,
               is_public, show_roster, show_online,
               created_at, updated_at
        FROM frozenthrone.member_profiles
        WHERE public_slug = ?
        LIMIT 1
      `, [normalized]);

      return rows[0] || null;
    } finally {
      await conn.end();
    }
  }

  async function syncTavernMembers() {
    let conn;

    try {
      conn = await authDb("main");

      const [rows] = await conn.execute(`
        SELECT DISTINCT UPPER(username) AS username
        FROM frozenthrone.member_wall_messages
        WHERE deleted_at IS NULL
          AND username <> ''
      `);

      for (const row of rows) {
        await getProfileByUsername(row.username);
      }
    } catch (error) {
      console.warn("Public Tavern identity sync skipped:", error.message);
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  }

  async function loadRosters(privateUsername) {
    const username = normalizeUsername(privateUsername);
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
        `, [username]);

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
        console.warn(`Public roster lookup failed for ${realm.key}:`, error.message);
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

  function profileControls(req, target, relationship) {
    if (!req.user) {
      return `
        <a class="member-action"
           href="/login?next=${encodeURIComponent(`/members/${target.public_slug}`)}">
          Login to Add Friend
        </a>
      `;
    }

    const current = normalizeUsername(req.user.username);
    const csrf = esc(req.user.csrfToken || "");

    if (current === target.username) {
      return `
        <a class="member-action secondary" href="/friends">
          Manage Friends
        </a>
      `;
    }

    if (!relationship) {
      return `
        <form method="POST" action="/members/${esc(target.public_slug)}/friend">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="member-action" type="submit">Add Friend</button>
        </form>
      `;
    }

    if (relationship.status === "accepted") {
      return `
        <span class="member-relationship accepted">✓ Friends</span>

        <form method="POST" action="/friends/${esc(target.public_slug)}/remove">
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
        <span class="member-relationship incoming">Friend Request Received</span>

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

        <form method="POST" action="/friends/${esc(target.public_slug)}/remove">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="member-action secondary" type="submit">
            Cancel Request
          </button>
        </form>
      `;
    }

    return `
      <form method="POST" action="/members/${esc(target.public_slug)}/friend">
        <input type="hidden" name="_csrf" value="${csrf}">
        <button class="member-action" type="submit">Send Friend Request</button>
      </form>
    `;
  }

  app.get("/members", async (req, res) => {
    let conn;

    try {
      const current = req.user
        ? await getProfileByUsername(req.user.username)
        : null;

      await syncTavernMembers();

      const search = String(req.query.search || "")
        .trim()
        .slice(0, 24);

      conn = await authDb("main");

      const [members] = await conn.execute(`
        SELECT
          p.public_handle,
          p.public_slug,
          p.bio,
          p.created_at,
          p.main_realm_key,
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
          AND p.public_handle LIKE ?
        ORDER BY p.updated_at DESC, p.public_handle ASC
        LIMIT 100
      `, [
        current?.username || "",
        `%${search}%`
      ]);

      const cards = members.map(member => `
        <a class="member-directory-card"
           href="/members/${encodeURIComponent(member.public_slug)}">
          <span class="member-directory-avatar">
            ${esc(member.public_handle.slice(0, 1))}
          </span>

          <div>
            <strong>${esc(member.public_handle)}</strong>
            <span>
              ${esc(realmLabel(member.main_realm_key || "main"))}
              · ${Number(member.friend_count || 0)}
              friend${Number(member.friend_count || 0) === 1 ? "" : "s"}
            </span>

            <p>
              ${esc(member.bio || "This member has not written a profile bio yet.")}
            </p>
          </div>
        </a>
      `).join("");

      render(req, res, "Members", `
        <link rel="stylesheet" href="/css/members.css?v=2">

        <main class="container members-page">
          <section>
            <header class="members-titlebar">
              <div>
                <p class="eyebrow">FrozenThrone Community</p>
                <h1>Member Directory</h1>
                <p>Public handles protect private game-login usernames.</p>
              </div>

              ${current ? `
                <div class="members-title-actions">
                  <a class="member-action"
                     href="/members/${encodeURIComponent(current.public_slug)}">
                    My Profile
                  </a>
                  <a class="member-action secondary" href="/friends">
                    Friends & Requests
                  </a>
                </div>
              ` : ""}
            </header>

            <form class="member-search" method="GET" action="/members">
              <input
                name="search"
                value="${esc(search)}"
                maxlength="24"
                placeholder="Search public handles"
              >
              <button type="submit">Search Members</button>
            </form>

            <div class="member-directory-grid">
              ${cards || `
                <div class="member-directory-empty">
                  <strong>Waiting for members…</strong>
                  <p>Public member profiles will appear here.</p>
                </div>
              `}
            </div>
          </section>
        </main>
      `);
    } catch (error) {
      console.error("Private member directory failed:", error);
      render(req, res, "Members", errorCard("The member directory could not be loaded."));
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  app.get("/members/:slug", async (req, res) => {
    let conn;

    try {
      const target = await getProfileBySlug(req.params.slug);

      if (!target) {
        return render(
          req,
          res,
          "Member Profile",
          errorCard("That public member profile does not exist.")
        );
      }

      const current = req.user
        ? await getProfileByUsername(req.user.username)
        : null;

      const isOwner = current?.username === target.username;

      if (!Number(target.is_public) && !isOwner) {
        return render(req, res, "Private Member", `
          <link rel="stylesheet" href="/css/members.css?v=2">

          <main class="container members-page">
            <section>
              <div class="member-private">
                <span>${esc(target.public_handle.slice(0, 1))}</span>
                <h1>${esc(target.public_handle)}</h1>
                <p>This member has chosen to keep their profile private.</p>
                <a class="member-action secondary" href="/members">
                  Back to Members
                </a>
              </div>
            </section>
          </main>
        `);
      }

      const roster = await loadRosters(target.username);
      const relationship = current
        ? await getRelationship(current.username, target.username)
        : null;

      conn = await authDb("main");

      const [friends] = await conn.execute(`
        SELECT
          p.public_handle,
          p.public_slug
        FROM frozenthrone.member_friendships f
        JOIN frozenthrone.member_profiles p
          ON p.username = CASE
            WHEN f.requester_username = ?
              THEN f.addressee_username
            ELSE f.requester_username
          END
        WHERE f.status = 'accepted'
          AND (
            f.requester_username = ? OR
            f.addressee_username = ?
          )
        ORDER BY f.responded_at DESC, f.id DESC
        LIMIT 24
      `, [
        target.username,
        target.username,
        target.username
      ]);

      let wallMessages = [];

      try {
        const [rows] = await conn.execute(`
          SELECT body, realm_key, created_at
          FROM frozenthrone.member_wall_messages
          WHERE UPPER(username) = ?
            AND deleted_at IS NULL
          ORDER BY id DESC
          LIMIT 5
        `, [target.username]);

        wallMessages = rows;
      } catch {}

      const totals = roster.reduce((summary, character) => {
        summary.levels += Number(character.level || 0);
        summary.gold += Number(character.money || 0);
        summary.playtime += Number(character.totaltime || 0);
        summary.kills += Number(character.totalKills || 0);
        summary.online += Number(character.online || 0) ? 1 : 0;
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
          character.realmKey === target.main_realm_key &&
          Number(character.guid) === Number(target.main_character_guid)
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
            ${Number(target.show_online)
              ? (Number(character.online)
                ? `<span class="member-online">Online</span>`
                : `<span class="member-offline">Offline</span>`)
              : `<span class="member-offline">Hidden</span>`}
          </td>
          <td>
            <a class="member-table-link"
               href="/armory/${esc(character.realmKey)}/${Number(character.guid)}">
              Armory
            </a>
          </td>
        </tr>
      `).join("");

      const friendCards = friends.map(friend => `
        <a class="member-friend-chip"
           href="/members/${encodeURIComponent(friend.public_slug)}">
          <span>${esc(friend.public_handle.slice(0, 1))}</span>
          <strong>${esc(friend.public_handle)}</strong>
        </a>
      `).join("");

      const messageCards = wallMessages.map(message => `
        <article class="member-profile-message">
          <p>${esc(message.body)}</p>
          <span>
            ${esc(realmLabel(message.realm_key))}
            · ${esc(formatDate(message.created_at))}
          </span>
        </article>
      `).join("");

      const characterOptions = roster.map(character => {
        const value = `${character.realmKey}:${Number(character.guid)}`;
        const selected =
          character.realmKey === target.main_realm_key &&
          Number(character.guid) === Number(target.main_character_guid);

        return `
          <option value="${esc(value)}" ${selected ? "selected" : ""}>
            ${esc(character.name)}
            — Level ${Number(character.level)}
            ${esc(className(character.class))}
            (${esc(character.realmName)})
          </option>
        `;
      }).join("");

      render(req, res, `${target.public_handle} - Member Profile`, `
        <link rel="stylesheet" href="/css/members.css?v=2">

        <main class="container members-page">
          <section>
            <article class="member-profile-hero">
              <div class="member-profile-avatar">
                ${esc(target.public_handle.slice(0, 1))}
              </div>

              <div class="member-profile-heading">
                <p class="eyebrow">FrozenThrone Member</p>
                <h1>${esc(target.public_handle)}</h1>

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
                  ${esc(target.bio || "This member has not written a profile bio yet.")}
                </p>
              </div>

              <div class="member-profile-actions">
                ${profileControls(req, target, relationship)}
                <a class="member-action secondary" href="/members">
                  All Members
                </a>
              </div>
            </article>

            <div class="member-stat-grid">
              <article><span>Characters</span><strong>${roster.length}</strong></article>
              <article><span>Combined Levels</span><strong>${totals.levels.toLocaleString()}</strong></article>
              <article><span>Combined Gold</span><strong>${esc(moneyToGold(totals.gold))}g</strong></article>
              <article><span>Playtime</span><strong>${esc(formatPlaytime(totals.playtime))}</strong></article>
              <article><span>Total Kills</span><strong>${totals.kills.toLocaleString()}</strong></article>
              <article><span>Online</span><strong>${Number(target.show_online) ? totals.online : "Private"}</strong></article>
              <article><span>Friends</span><strong>${friends.length}</strong></article>
              <article><span>Member Since</span><strong class="member-stat-date">${esc(formatDate(target.created_at))}</strong></article>
            </div>

            ${Number(target.show_roster) || isOwner ? `
              <article class="member-panel">
                <header>
                  <div>
                    <p class="eyebrow">Public Characters</p>
                    <h2>Character Roster</h2>
                  </div>
                  <span>${roster.length} characters</span>
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
                    No public characters are connected yet.
                  </div>
                `}
              </article>
            ` : `
              <article class="member-panel">
                <div class="member-panel-empty">
                  This member keeps their character roster private.
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
                  ${messageCards || `
                    <div class="member-panel-empty">
                      Waiting on a message from ${esc(target.public_handle)}…
                    </div>
                  `}
                </div>
              </article>
            </div>

            ${isOwner ? `
              <article class="member-panel member-settings">
                <header>
                  <div>
                    <p class="eyebrow">Private Owner Controls</p>
                    <h2>Public Identity & Profile</h2>
                  </div>
                </header>

                <form method="POST" action="/members/profile">
                  <input type="hidden"
                         name="_csrf"
                         value="${esc(req.user.csrfToken || "")}">

                  <label for="public-handle">Public Handle</label>
                  <input
                    id="public-handle"
                    name="publicHandle"
                    maxlength="24"
                    pattern="[A-Za-z0-9_-]{3,24}"
                    value="${esc(target.public_handle)}"
                    required
                  >
                  <p class="member-setting-note">
                    This replaces your private login name everywhere in the
                    community. After the first change, handles have a 30-day
                    change cooldown.
                  </p>

                  <label for="member-bio">Profile Bio</label>
                  <textarea
                    id="member-bio"
                    name="bio"
                    maxlength="500"
                    placeholder="Tell the community about yourself."
                  >${esc(target.bio || "")}</textarea>

                  <label for="member-main-character">Main Character</label>
                  <select id="member-main-character" name="mainCharacter">
                    <option value="">No main character selected</option>
                    ${characterOptions}
                  </select>

                  <div class="member-privacy-options">
                    <label>
                      <input type="checkbox"
                             name="isPublic"
                             value="1"
                             ${Number(target.is_public) ? "checked" : ""}>
                      Public member profile
                    </label>

                    <label>
                      <input type="checkbox"
                             name="showRoster"
                             value="1"
                             ${Number(target.show_roster) ? "checked" : ""}>
                      Show character roster
                    </label>

                    <label>
                      <input type="checkbox"
                             name="showOnline"
                             value="1"
                             ${Number(target.show_online) ? "checked" : ""}>
                      Show online status
                    </label>
                  </div>

                  <button class="member-action" type="submit">
                    Save Public Identity
                  </button>
                </form>
              </article>
            ` : ""}
          </section>
        </main>
      `);
    } catch (error) {
      console.error("Public-handle member profile failed:", error);
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

    const current = await getProfileByUsername(req.user.username);
    const requestedHandle = String(req.body.publicHandle || "").trim();

    if (!validHandle(requestedHandle)) {
      return render(
        req,
        res,
        "Invalid Public Handle",
        errorCard("Handles must contain 3–24 letters, numbers, underscores or hyphens.")
      );
    }

    if (reservedHandles.has(requestedHandle.toUpperCase())) {
      return render(
        req,
        res,
        "Reserved Public Handle",
        errorCard("That handle is reserved for FrozenThrone operations or staff.")
      );
    }

    const requestedSlug = requestedHandle.toLowerCase();
    const handleChanged =
      requestedSlug !== String(current.public_slug).toLowerCase();

    if (handleChanged && current.handle_changed_at) {
      const changedAt = new Date(current.handle_changed_at).getTime();
      const cooldown = 30 * 24 * 60 * 60 * 1000;
      const remaining = cooldown - (Date.now() - changedAt);

      if (remaining > 0) {
        const days = Math.ceil(remaining / 86400000);

        return render(
          req,
          res,
          "Handle Cooldown",
          errorCard(`Your public handle can be changed again in ${days} day${days === 1 ? "" : "s"}.`)
        );
      }
    }

    const roster = await loadRosters(current.username);
    const requestedMain = String(req.body.mainCharacter || "");

    let mainRealm = null;
    let mainGuid = null;

    if (requestedMain.includes(":")) {
      const [realmKey, rawGuid] = requestedMain.split(":");
      const guid = Number(rawGuid);

      const character = roster.find(item =>
        item.realmKey === realmKey &&
        Number(item.guid) === guid
      );

      if (character) {
        mainRealm = character.realmKey;
        mainGuid = Number(character.guid);
      }
    }

    let conn;

    try {
      conn = await authDb("main");

      const [duplicates] = await conn.execute(`
        SELECT public_slug
        FROM frozenthrone.member_profiles
        WHERE public_slug = ?
          AND username <> ?
        LIMIT 1
      `, [requestedSlug, current.username]);

      if (duplicates.length) {
        return render(
          req,
          res,
          "Handle Unavailable",
          errorCard("That public handle is already in use. Choose another.")
        );
      }

      await conn.execute(`
        UPDATE frozenthrone.member_profiles
        SET public_handle = ?,
            public_slug = ?,
            handle_changed_at =
              CASE WHEN public_slug <> ? THEN CURRENT_TIMESTAMP
                   ELSE handle_changed_at END,
            bio = ?,
            main_realm_key = ?,
            main_character_guid = ?,
            is_public = ?,
            show_roster = ?,
            show_online = ?
        WHERE username = ?
      `, [
        requestedHandle,
        requestedSlug,
        requestedSlug,
        String(req.body.bio || "").trim().slice(0, 500),
        mainRealm,
        mainGuid,
        req.body.isPublic === "1" ? 1 : 0,
        req.body.showRoster === "1" ? 1 : 0,
        req.body.showOnline === "1" ? 1 : 0,
        current.username
      ]);

      res.redirect(`/members/${encodeURIComponent(requestedSlug)}`);
    } catch (error) {
      console.error("Public identity save failed:", error);
      render(req, res, "Profile Error", errorCard("The public identity could not be saved."));
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  app.post("/members/:slug/friend", requireLogin, async (req, res) => {
    if (!validCsrf(req)) {
      return res.status(403).send("Invalid or expired form token.");
    }

    const current = await getProfileByUsername(req.user.username);
    const target = await getProfileBySlug(req.params.slug);

    if (!target || target.username === current.username) {
      return res.redirect(`/members/${encodeURIComponent(current.public_slug)}`);
    }

    const [low, high] = pairFor(current.username, target.username);
    let conn;

    try {
      conn = await authDb("main");

      const [rows] = await conn.execute(`
        SELECT id, requester_username, addressee_username, status
        FROM frozenthrone.member_friendships
        WHERE member_low = ?
          AND member_high = ?
        LIMIT 1
      `, [low, high]);

      const existing = rows[0];

      if (
        existing &&
        existing.status === "pending" &&
        existing.addressee_username === current.username
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
            (member_low, member_high,
             requester_username, addressee_username)
          VALUES (?, ?, ?, ?)
        `, [low, high, current.username, target.username]);
      } else if (existing.status !== "accepted") {
        await conn.execute(`
          UPDATE frozenthrone.member_friendships
          SET requester_username = ?,
              addressee_username = ?,
              status = 'pending',
              created_at = CURRENT_TIMESTAMP,
              responded_at = NULL
          WHERE id = ?
        `, [
          current.username,
          target.username,
          Number(existing.id)
        ]);
      }

      res.redirect(`/members/${encodeURIComponent(target.public_slug)}`);
    } catch (error) {
      console.error("Private friend request failed:", error);
      render(req, res, "Friend Request", errorCard("The friend request could not be sent."));
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  app.get("/friends", requireLogin, async (req, res) => {
    const current = await getProfileByUsername(req.user.username);
    let conn;

    try {
      conn = await authDb("main");

      const [relationships] = await conn.execute(`
        SELECT
          f.id,
          f.requester_username,
          f.addressee_username,
          f.status,
          f.created_at,
          p.public_handle AS other_handle,
          p.public_slug AS other_slug
        FROM frozenthrone.member_friendships f
        JOIN frozenthrone.member_profiles p
          ON p.username = CASE
            WHEN f.requester_username = ?
              THEN f.addressee_username
            ELSE f.requester_username
          END
        WHERE f.requester_username = ?
           OR f.addressee_username = ?
        ORDER BY
          CASE WHEN f.status = 'pending' THEN 0 ELSE 1 END,
          f.created_at DESC
      `, [
        current.username,
        current.username,
        current.username
      ]);

      const csrf = esc(req.user.csrfToken || "");

      function card(item, actions) {
        return `
          <article class="friend-request-card">
            <a href="/members/${encodeURIComponent(item.other_slug)}">
              <span>${esc(item.other_handle.slice(0, 1))}</span>
              <strong>${esc(item.other_handle)}</strong>
            </a>
            <div>${actions}</div>
          </article>
        `;
      }

      const incoming = relationships.filter(item =>
        item.status === "pending" &&
        item.addressee_username === current.username
      );

      const outgoing = relationships.filter(item =>
        item.status === "pending" &&
        item.requester_username === current.username
      );

      const accepted = relationships.filter(item =>
        item.status === "accepted"
      );

      const incomingCards = incoming.map(item => card(item, `
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
      `)).join("");

      const acceptedCards = accepted.map(item => card(item, `
        <form method="POST" action="/friends/${encodeURIComponent(item.other_slug)}/remove">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="member-action secondary" type="submit">Remove</button>
        </form>
      `)).join("");

      const outgoingCards = outgoing.map(item => card(item, `
        <form method="POST" action="/friends/${encodeURIComponent(item.other_slug)}/remove">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="member-action secondary" type="submit">Cancel</button>
        </form>
      `)).join("");

      render(req, res, "Friends", `
        <link rel="stylesheet" href="/css/members.css?v=2">

        <main class="container members-page">
          <section>
            <header class="members-titlebar">
              <div>
                <p class="eyebrow">FrozenThrone Community</p>
                <h1>Friends & Requests</h1>
                <p>Only public handles are displayed here.</p>
              </div>

              <div class="members-title-actions">
                <a class="member-action"
                   href="/members/${encodeURIComponent(current.public_slug)}">
                  My Profile
                </a>
                <a class="member-action secondary" href="/members">
                  Find Members
                </a>
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
                  ${incomingCards || `<div class="member-panel-empty">Waiting for a friend request…</div>`}
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
                  ${acceptedCards || `<div class="member-panel-empty">Your accepted friends will appear here.</div>`}
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
                  ${outgoingCards || `<div class="member-panel-empty">You have no pending requests.</div>`}
                </div>
              </article>
            </div>
          </section>
        </main>
      `);
    } catch (error) {
      console.error("Private friends page failed:", error);
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
    const current = await getProfileByUsername(req.user.username);
    const decision =
      req.body.decision === "accept" ? "accepted" : "declined";

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
      `, [decision, id, current.username]);

      res.redirect("/friends");
    } catch (error) {
      console.error("Private friend response failed:", error);
      render(req, res, "Friends", errorCard("The friend request could not be updated."));
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  app.post("/friends/:slug/remove", requireLogin, async (req, res) => {
    if (!validCsrf(req)) {
      return res.status(403).send("Invalid or expired form token.");
    }

    const current = await getProfileByUsername(req.user.username);
    const target = await getProfileBySlug(req.params.slug);

    if (!target || target.username === current.username) {
      return res.redirect("/friends");
    }

    const [low, high] = pairFor(current.username, target.username);
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
      `, [
        low,
        high,
        current.username,
        current.username
      ]);

      res.redirect("/friends");
    } catch (error) {
      console.error("Private friend removal failed:", error);
      render(req, res, "Friends", errorCard("The friendship could not be removed."));
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });
};
