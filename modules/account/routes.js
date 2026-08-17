module.exports = function registerAccountRoutes(app, deps) {
  const {
    render,
    errorCard,
    esc,
    characterDb,
    authDb,
    className,
    raceName,
    moneyToGold,
    requireLogin
  } = deps;

  function formatDate(value) {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
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

  function maskEmail(email) {
    const value = String(email || "").trim();
    const parts = value.split("@");
    if (parts.length !== 2) return "Not available";

    const name = parts[0];
    const visible = name.slice(0, Math.min(2, name.length));
    return `${visible}${"*".repeat(Math.max(3, name.length - visible.length))}@${parts[1]}`;
  }

  function expansionName(value) {
    return Number(value) >= 2 ? "Wrath of the Lich King" : "Classic access";
  }

  app.get("/account", requireLogin, async (req, res) => {
    const realm = req.activeRealm;
    let authConn;
    let charConn;
    let walletConn;

    try {
      authConn = await authDb(realm);
      charConn = await characterDb(realm);
      walletConn = await authDb("main");

      const [[account]] = await authConn.execute(
        `SELECT id, username, email, joindate, last_login,
                failed_logins, locked, online, expansion
         FROM account
         WHERE id = ?
         LIMIT 1`,
        [req.user.id]
      );

      const [characters] = await charConn.execute(
        `SELECT guid, name, race, class, gender, level, xp, money,
                online, totaltime, logout_time, totalKills,
                arenaPoints, totalHonorPoints
         FROM characters
         WHERE account = ?
           AND (deleteDate IS NULL OR deleteDate = 0)
         ORDER BY online DESC, level DESC, name ASC`,
        [req.user.id]
      );

      let wallet = {
        lifetime_votes: 0,
        vote_tokens: 0,
        pending_gold: 0,
        current_streak: 0,
        last_vote_at: null
      };

      try {
        const [walletRows] = await walletConn.execute(
          `SELECT lifetime_votes, vote_tokens, pending_gold,
                  current_streak, last_vote_at
           FROM frozenthrone.vote_accounts
           WHERE realm_key = ?
             AND account_id = ?
           LIMIT 1`,
          [realm.key, req.user.id]
        );

        if (walletRows.length) wallet = walletRows[0];
      } catch (walletError) {
        console.warn("Account wallet unavailable:", walletError.message);
      }

      let uptime = null;

      try {
        const [uptimeRows] = await authConn.execute(
          `SELECT starttime, uptime, maxplayers
           FROM uptime
           WHERE realmid = ?
           ORDER BY starttime DESC
           LIMIT 1`,
          [realm.realm_id]
        );

        uptime = uptimeRows[0] || null;
      } catch (uptimeError) {
        console.warn("Account realm uptime unavailable:", uptimeError.message);
      }

      const totals = characters.reduce((summary, character) => {
        summary.levels += Number(character.level || 0);
        summary.money += Number(character.money || 0);
        summary.playtime += Number(character.totaltime || 0);
        summary.kills += Number(character.totalKills || 0);
        summary.honor += Number(character.totalHonorPoints || 0);
        summary.arena += Number(character.arenaPoints || 0);
        summary.online += Number(character.online || 0) === 1 ? 1 : 0;
        return summary;
      }, {
        levels: 0,
        money: 0,
        playtime: 0,
        kills: 0,
        honor: 0,
        arena: 0,
        online: 0
      });

      const characterRows = characters.map(character => `
        <tr>
          <td>
            <div class="acct-character">
              <span class="acct-class-dot class-${Number(character.class)}"></span>
              <div>
                <a href="/armory/${esc(realm.key)}/${Number(character.guid)}">
                  ${esc(character.name)}
                </a>
                <small>${esc(raceName(character.race))} ${esc(className(character.class))}</small>
              </div>
            </div>
          </td>
          <td class="acct-number"><strong>${Number(character.level || 0)}</strong></td>
          <td>${esc(moneyToGold(character.money))}g</td>
          <td>${esc(formatPlaytime(character.totaltime))}</td>
          <td>${Number(character.totalKills || 0).toLocaleString()}</td>
          <td>${Number(character.totalHonorPoints || 0).toLocaleString()}</td>
          <td>${Number(character.arenaPoints || 0).toLocaleString()}</td>
          <td>
            ${Number(character.online) === 1
              ? `<span class="acct-status online"><i></i>Online</span>`
              : `<span class="acct-status offline"><i></i>${esc(formatDate(Number(character.logout_time || 0) * 1000))}</span>`}
          </td>
          <td><a class="acct-mini-btn" href="/armory/${esc(realm.key)}/${Number(character.guid)}">Profile</a></td>
        </tr>
      `).join("");

      const serverOnline = Boolean(uptime);

      render(req, res, "Account", `
        <link rel="stylesheet" href="/css/account.css?v=1">

        <main class="container account-command-center">
          <section class="acct-page">
            <div class="acct-titlebar">
              <div>
                <p class="acct-kicker">${esc(realm.name)} Player Services</p>
                <h1>Account Command Center</h1>
                <p>
                  Welcome back, <strong>${esc(account?.username || req.user.username)}</strong>.
                  Everything connected to this realm is organized below.
                </p>
              </div>

              <div class="acct-title-status">
                <span class="acct-status ${serverOnline ? "online" : "offline"}">
                  <i></i>${serverOnline ? "Realm Online" : "Status Unavailable"}
                </span>
                <small>WotLK 3.3.5a · Build 12340</small>
              </div>
            </div>

            <nav class="acct-quickbar" aria-label="Account actions">
              <a href="/armory">Armory</a>
              <a href="/vote">Vote & Earn</a>
              <a href="/shop">Token Shop</a>
              <a href="/download">Launcher</a>
              <a href="/forums">Forums</a>
              <a href="/guilds">Guilds</a>
              <a href="/logout" class="danger">Log Out</a>
            </nav>

            <div class="acct-summary-grid">
              <article class="acct-summary">
                <span>Characters</span>
                <strong>${characters.length}</strong>
                <small>${totals.online} currently online</small>
              </article>

              <article class="acct-summary">
                <span>Combined Levels</span>
                <strong>${totals.levels.toLocaleString()}</strong>
                <small>Across this realm</small>
              </article>

              <article class="acct-summary">
                <span>Combined Gold</span>
                <strong>${esc(moneyToGold(totals.money))}g</strong>
                <small>Character wallets</small>
              </article>

              <article class="acct-summary">
                <span>Total Playtime</span>
                <strong>${esc(formatPlaytime(totals.playtime))}</strong>
                <small>All characters</small>
              </article>

              <article class="acct-summary token">
                <span>Vote Tokens</span>
                <strong>${Number(wallet.vote_tokens || 0).toLocaleString()}</strong>
                <small><a href="/shop">Spend rewards</a></small>
              </article>

              <article class="acct-summary">
                <span>Lifetime Votes</span>
                <strong>${Number(wallet.lifetime_votes || 0).toLocaleString()}</strong>
                <small>${Number(wallet.current_streak || 0)} vote streak</small>
              </article>

              <article class="acct-summary">
                <span>Total Kills</span>
                <strong>${totals.kills.toLocaleString()}</strong>
                <small>Account roster</small>
              </article>

              <article class="acct-summary">
                <span>Honor Points</span>
                <strong>${totals.honor.toLocaleString()}</strong>
                <small>${totals.arena.toLocaleString()} arena points</small>
              </article>
            </div>

            <div class="acct-layout">
              <div class="acct-primary">
                <article class="acct-panel">
                  <header class="acct-panel-head">
                    <div>
                      <span>Character Management</span>
                      <h2>${esc(realm.name)} Roster</h2>
                    </div>
                    <a href="/armory/characters">Browse Realm</a>
                  </header>

                  ${characters.length ? `
                    <div class="acct-table-wrap">
                      <table class="acct-table">
                        <thead>
                          <tr>
                            <th>Character</th>
                            <th>Level</th>
                            <th>Gold</th>
                            <th>Played</th>
                            <th>Kills</th>
                            <th>Honor</th>
                            <th>Arena</th>
                            <th>Last Seen</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>${characterRows}</tbody>
                      </table>
                    </div>
                  ` : `
                    <div class="acct-empty">
                      <strong>No characters found on ${esc(realm.name)}</strong>
                      <p>Create your first character through the FrozenThrone game client.</p>
                      <a class="acct-action" href="/download">Download Launcher</a>
                    </div>
                  `}
                </article>

                <div class="acct-two-column">
                  <article class="acct-panel">
                    <header class="acct-panel-head">
                      <div>
                        <span>Realm Configuration</span>
                        <h2>Gameplay Information</h2>
                      </div>
                    </header>

                    <dl class="acct-detail-list">
                      <div><dt>Expansion</dt><dd>Wrath of the Lich King</dd></div>
                      <div><dt>Client</dt><dd>3.3.5a / Build 12340</dd></div>
                      <div><dt>Realmlist</dt><dd><code>set realmlist frozenthrone.co</code></dd></div>
                      <div><dt>Leveling</dt><dd>Accelerated XP with adjustable rates</dd></div>
                      <div><dt>Skills & Reputation</dt><dd>Accelerated progression</dd></div>
                      <div><dt>Account Mounts</dt><dd>Shared where supported</dd></div>
                      <div><dt>Looting</dt><dd>Area-of-effect quality-of-life tools</dd></div>
                      <div><dt>Economy</dt><dd>Automated Auction House support</dd></div>
                    </dl>
                  </article>

                  <article class="acct-panel">
                    <header class="acct-panel-head">
                      <div>
                        <span>New Player Checklist</span>
                        <h2>Ready to Play</h2>
                      </div>
                    </header>

                    <ol class="acct-checklist">
                      <li class="done"><i>1</i><span><strong>Game account created</strong>Your website and game login are the same.</span></li>
                      <li><i>2</i><span><strong>Install the launcher</strong>Download, update and repair your client.</span></li>
                      <li><i>3</i><span><strong>Select this realm</strong>Choose ${esc(realm.name)} before pressing Play.</span></li>
                      <li><i>4</i><span><strong>Create a character</strong>Your roster will automatically appear here.</span></li>
                      <li><i>5</i><span><strong>Vote for rewards</strong>Earn tokens and spend them in the shop.</span></li>
                    </ol>
                  </article>
                </div>

                <article class="acct-panel acct-services">
                  <header class="acct-panel-head">
                    <div>
                      <span>Player Services</span>
                      <h2>Useful Destinations</h2>
                    </div>
                  </header>

                  <div class="acct-service-grid">
                    <a href="/download"><strong>Launcher & Client</strong><span>Install, repair and update the game.</span></a>
                    <a href="/vote"><strong>Vote Rewards</strong><span>Earn tokens and account rewards.</span></a>
                    <a href="/shop"><strong>Token Shop</strong><span>Send available rewards to a character.</span></a>
                    <a href="/armory"><strong>World Database</strong><span>Characters, items, quests, NPCs and spells.</span></a>
                    <a href="/guilds"><strong>Guild Directory</strong><span>Search guilds, leaders and members.</span></a>
                    <a href="/forums"><strong>Community Forums</strong><span>News, guides, support and discussions.</span></a>
                  </div>
                </article>
              </div>

              <aside class="acct-sidebar">
                <article class="acct-panel">
                  <header class="acct-panel-head">
                    <div>
                      <span>Account Record</span>
                      <h2>Profile Details</h2>
                    </div>
                  </header>

                  <dl class="acct-detail-list">
                    <div><dt>Username</dt><dd>${esc(account?.username || req.user.username)}</dd></div>
                    <div><dt>Account ID</dt><dd>#${Number(req.user.id)}</dd></div>
                    <div><dt>Realm</dt><dd>${esc(realm.name)}</dd></div>
                    <div><dt>Email</dt><dd>${esc(maskEmail(account?.email))}</dd></div>
                    <div><dt>Created</dt><dd>${esc(formatDate(account?.joindate))}</dd></div>
                    <div><dt>Last Login</dt><dd>${esc(formatDate(account?.last_login))}</dd></div>
                    <div><dt>Access</dt><dd>${esc(expansionName(account?.expansion))}</dd></div>
                  </dl>
                </article>

                <article class="acct-panel">
                  <header class="acct-panel-head">
                    <div>
                      <span>Account Security</span>
                      <h2>Status</h2>
                    </div>
                  </header>

                  <div class="acct-security-state good">
                    <strong>${Number(account?.locked || 0) ? "Account Restricted" : "Account Active"}</strong>
                    <span>${Number(account?.locked || 0)
                      ? "This account currently has a login restriction."
                      : "No account lock is currently reported."}</span>
                  </div>

                  <dl class="acct-detail-list compact">
                    <div><dt>Failed Logins</dt><dd>${Number(account?.failed_logins || 0)}</dd></div>
                    <div><dt>Game Session</dt><dd>${Number(account?.online || 0) ? "Online" : "Offline"}</dd></div>
                    <div><dt>Website Session</dt><dd>Protected</dd></div>
                    <div><dt>Realm Bound</dt><dd>${esc(realm.name)}</dd></div>
                  </dl>

                  <p class="acct-note">
                    Never share your password. FrozenThrone staff will never ask for it.
                  </p>
                </article>

                <article class="acct-panel">
                  <header class="acct-panel-head">
                    <div>
                      <span>Vote Wallet</span>
                      <h2>Reward Status</h2>
                    </div>
                  </header>

                  <dl class="acct-detail-list">
                    <div><dt>Available Tokens</dt><dd>${Number(wallet.vote_tokens || 0).toLocaleString()}</dd></div>
                    <div><dt>Lifetime Votes</dt><dd>${Number(wallet.lifetime_votes || 0).toLocaleString()}</dd></div>
                    <div><dt>Current Streak</dt><dd>${Number(wallet.current_streak || 0)}</dd></div>
                    <div><dt>Pending Gold</dt><dd>${Number(wallet.pending_gold || 0).toLocaleString()}</dd></div>
                    <div><dt>Last Vote</dt><dd>${esc(formatDate(wallet.last_vote_at))}</dd></div>
                  </dl>

                  <div class="acct-button-row">
                    <a class="acct-action" href="/vote">Vote Now</a>
                    <a class="acct-action secondary" href="/shop">Open Shop</a>
                  </div>
                </article>

                <article class="acct-panel acct-realm-help">
                  <header class="acct-panel-head">
                    <div>
                      <span>Multiple Realms</span>
                      <h2>Switching Accounts</h2>
                    </div>
                  </header>

                  <p>
                    Each realm keeps its own account and character records. Use the realm selector
                    in the website header to switch safely.
                  </p>
                  <p class="acct-note">
                    Switching realms logs out this website session before opening the other realm.
                  </p>
                </article>
              </aside>
            </div>
          </section>
        </main>
      `);
    } catch (error) {
      console.error("Account command center failed:", error);
      render(req, res, "Account", errorCard("The account command center could not be loaded."));
    } finally {
      if (charConn) {
        try { await charConn.end(); } catch {}
      }

      if (walletConn) {
        try { await walletConn.end(); } catch {}
      }

      if (authConn) {
        try { await authConn.end(); } catch {}
      }
    }
  });
};
