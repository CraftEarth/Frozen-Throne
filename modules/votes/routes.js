const dns = require("dns").promises;

module.exports = function registerVoteRoutes(app, tools) {
  const { render, esc, mysql, dbConfig, requireLogin, getRealm } = tools;
  let topgAddressCache = { expiresAt: 0, addresses: [] };

  async function ftDb() {
    return mysql.createConnection({ ...dbConfig, database: "frozenthrone" });
  }

  function normalizeIp(value) {
    return String(value || "").trim().replace(/^::ffff:/, "").split("%")[0];
  }

  function requestSourceIp(req) {
    const socketIp = normalizeIp(req.socket.remoteAddress);
    const localProxy = socketIp === "::1" || socketIp === "127.0.0.1" || socketIp.startsWith("127.");
    if (!localProxy) return socketIp;

    const forwarded = String(req.headers["x-forwarded-for"] || "")
      .split(",")
      .map(normalizeIp)
      .filter(Boolean);
    return forwarded.at(-1) || socketIp;
  }

  async function topgAddresses() {
    if (topgAddressCache.expiresAt > Date.now()) return topgAddressCache.addresses;
    const rows = await dns.lookup("monitor.topg.org", { all: true });
    topgAddressCache = {
      expiresAt: Date.now() + (10 * 60 * 1000),
      addresses: rows.map(row => normalizeIp(row.address))
    };
    return topgAddressCache.addresses;
  }

  async function validTopgSource(req) {
    if (String(process.env.TOPG_CALLBACK_ALLOW_UNVERIFIED || "").toLowerCase() === "true") return true;
    const allowed = await topgAddresses();
    return allowed.includes(requestSourceIp(req));
  }

  function voteError(message) {
    return `<main class="container"><div class="card"><h3>Vote Error</h3><p>${esc(message)}</p></div></main>`;
  }

  app.get("/vote", requireLogin, async (req, res) => {
    const conn = await ftDb();
    const realm = req.activeRealm;

    try {
      const [[stats]] = await conn.execute(`
        SELECT lifetime_votes, vote_tokens, pending_gold, current_streak, last_vote_at,
               DATE_ADD(last_vote_at, INTERVAL 6 HOUR) AS next_vote_at
        FROM frozenthrone.vote_accounts
        WHERE realm_key = ? AND account_id = ?
      `, [realm.key, req.user.id]);

      const [history] = await conn.execute(`
        SELECT site, reward_tokens, reward_gold, created_at
        FROM frozenthrone.vote_logs
        WHERE realm_key = ? AND account_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `, [realm.key, req.user.id]);

      const lifetimeVotes = Number(stats?.lifetime_votes || 0);
      const voteTokens = Number(stats?.vote_tokens || 0);
      const pendingGold = Number(stats?.pending_gold || 0);
      const currentStreak = Number(stats?.current_streak || 0);
      const lastVote = stats?.last_vote_at ? new Date(stats.last_vote_at).toLocaleString() : "Never";
      const nextVoteAt = stats?.next_vote_at ? new Date(stats.next_vote_at) : null;
      const readyToVote = !nextVoteAt || nextVoteAt <= new Date();
      const nextVoteText = readyToVote ? "Ready Now" : nextVoteAt.toLocaleString();

      const historyRows = history.map(vote => `
        <tr>
          <td>${esc(vote.site)}</td>
          <td>${esc(new Date(vote.created_at).toLocaleString())}</td>
          <td>${esc(vote.reward_tokens)} token</td>
          <td>${esc(vote.reward_gold)} gold</td>
        </tr>
      `).join("");

      render(req, res, `${realm.name} Vote Rewards`, `
        <main class="container">
          <section>
            <div class="section-head">
              <p class="eyebrow">${esc(realm.name)} Voting</p>
              <h1>Vote Rewards</h1>
              <p>Support ${esc(realm.name)} every 6 hours. Rewards are credited to this realm's wallet automatically.</p>
            </div>

            <div class="grid grid-4">
              <div class="card stat"><span>Lifetime Votes</span><strong>${esc(lifetimeVotes)}</strong></div>
              <div class="card stat"><span>Vote Tokens</span><strong>${esc(voteTokens)}</strong></div>
              <div class="card stat"><span>Pending Gold</span><strong>${esc(pendingGold)}g</strong></div>
              <div class="card stat"><span>Vote Streak</span><strong>${esc(currentStreak)}</strong></div>
            </div>

            <div class="card highlight">
              <h2>⏳ Next Vote</h2>
              <p><strong>${esc(nextVoteText)}</strong></p>
              <p class="muted">${readyToVote ? "You can vote now." : `Last vote: ${esc(lastVote)}`}</p>
            </div>

            <div class="grid grid-2">
              <div class="card highlight">
                <h2>🎁 Every Vote Rewards You With</h2>
                <ul class="clean-list">
                  <li>🪙 1 Vote Token</li>
                  <li>💰 1 Gold held in your reward wallet</li>
                </ul>
                <p class="muted">You may vote once every <strong>6 hours</strong>.</p>
                <a class="btn gold" href="/vote/start/topg">Vote on TopG</a>
                <a class="btn secondary" href="/shop">Spend Vote Tokens</a>
              </div>

              <div class="card">
                <h2>🔥 Vote Streak</h2>
                <p>Current streak: <strong>${esc(currentStreak)}</strong></p>
                <hr>
                <h3>Next Milestone</h3>
                <p>🏆 <strong>150 Votes</strong><br>Rare Exclusive Mount</p>
                <p class="muted">Milestone rewards remain account-side until claimed.</p>
              </div>
            </div>

            <div class="card">
              <h2>Recent Vote History</h2>
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>Site</th><th>Date</th><th>Tokens</th><th>Gold</th></tr></thead>
                  <tbody>${historyRows || `<tr><td colspan="4">No votes on this realm yet.</td></tr>`}</tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <h2>How Voting Works</h2>
              <ol>
                <li>Choose FrozenThrone or Shadowmourne in the website header.</li>
                <li>Login to that realm's account.</li>
                <li>Click Vote on TopG and complete the vote.</li>
                <li>TopG calls the website back and credits the selected realm.</li>
                <li>Spend the Vote Tokens in the shop.</li>
              </ol>
            </div>
          </section>
        </main>
      `);
    } catch (err) {
      console.error("vote page failed", err);
      render(req, res, "Vote Error", voteError("The vote wallet is not ready. Run the vote/shop migration first."));
    } finally {
      await conn.end();
    }
  });

  app.get("/vote/start/topg", requireLogin, async (req, res) => {
    const username = String(req.user.username || "")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 50);
    const conn = await ftDb();

    try {
      await conn.execute(`
        INSERT INTO frozenthrone.vote_intents (realm_key, account_id, username, site)
        VALUES (?, ?, ?, 'topg')
      `, [req.activeRealm.key, req.user.id, username]);

      await conn.execute(`
        DELETE FROM frozenthrone.vote_intents
        WHERE consumed_at IS NOT NULL
           OR created_at < DATE_SUB(NOW(), INTERVAL 2 DAY)
      `);

      res.redirect(`https://topg.org/wow-private-servers/server-683511-${encodeURIComponent(username)}#vote`);
    } catch (err) {
      console.error("vote start failed", err);
      render(req, res, "Vote Error", voteError("Voting could not start. Run the vote/shop migration first."));
    } finally {
      await conn.end();
    }
  });

  app.get("/vote/callback/topg", async (req, res) => {
    const conn = await ftDb();
    const param = String(req.query.p_resp || "").trim();
    const username = param.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 50);
    const voteIp = normalizeIp(req.query.ip);
    const sourceIp = requestSourceIp(req);
    let debugId = 0;

    async function logResult(result) {
      try {
        if (debugId) {
          await conn.execute(
            "UPDATE frozenthrone.vote_callback_debug SET result = ? WHERE id = ?",
            [result, debugId]
          );
        }
      } catch (err) {
        console.error("topg callback result log failed", err.message);
      }
    }

    try {
      const [debug] = await conn.execute(`
        INSERT INTO frozenthrone.vote_callback_debug
          (site, ip, request_ip, result, query_payload)
        VALUES ('topg', ?, ?, 'received', ?)
      `, [voteIp, sourceIp, JSON.stringify(req.query)]);
      debugId = Number(debug.insertId);

      if (!username || username !== param) {
        await logResult("invalid_parameter");
        return res.status(400).send("INVALID_PARAMETER");
      }

      if (!await validTopgSource(req)) {
        await logResult("rejected_source");
        return res.status(403).send("INVALID_SOURCE");
      }

      await conn.beginTransaction();

      const [[intent]] = await conn.execute(`
        SELECT id, realm_key, account_id
        FROM frozenthrone.vote_intents
        WHERE site = 'topg'
          AND UPPER(username) = UPPER(?)
          AND consumed_at IS NULL
          AND created_at > DATE_SUB(NOW(), INTERVAL 2 HOUR)
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
      `, [username]);

      const realm = getRealm(intent?.realm_key || "main") || getRealm("main");
      const authDb = safeIdentifier(realm.auth_db);
      const [[account]] = await conn.execute(`
        SELECT id, username
        FROM ${authDb}.account
        WHERE UPPER(username) = UPPER(?)
        LIMIT 1
      `, [username]);

      if (!account || (intent && Number(intent.account_id) !== Number(account.id))) {
        await conn.rollback();
        await logResult("account_not_found");
        return res.status(404).send("ACCOUNT_NOT_FOUND");
      }

      await conn.execute(`
        INSERT IGNORE INTO frozenthrone.vote_accounts
          (account_id, realm_key, lifetime_votes, vote_tokens, pending_gold, current_streak, last_vote_at)
        VALUES (?, ?, 0, 0, 0, 0, NULL)
      `, [account.id, realm.key]);

      const [[wallet]] = await conn.execute(`
        SELECT last_vote_at
        FROM frozenthrone.vote_accounts
        WHERE realm_key = ? AND account_id = ?
        FOR UPDATE
      `, [realm.key, account.id]);

      if (wallet?.last_vote_at && new Date(wallet.last_vote_at) > new Date(Date.now() - (6 * 60 * 60 * 1000))) {
        if (intent) {
          await conn.execute("UPDATE frozenthrone.vote_intents SET consumed_at = NOW() WHERE id = ?", [intent.id]);
        }
        await conn.commit();
        await logResult("cooldown");
        return res.send("COOLDOWN");
      }

      await conn.execute(`
        INSERT INTO frozenthrone.vote_logs
          (account_id, realm_key, site, vote_code, ip, reward_tokens, reward_gold, callback_payload)
        VALUES (?, ?, 'topg', ?, ?, 1, 1, ?)
      `, [account.id, realm.key, param, voteIp, JSON.stringify(req.query)]);

      await conn.execute(`
        UPDATE frozenthrone.vote_accounts
        SET lifetime_votes = lifetime_votes + 1,
            vote_tokens = vote_tokens + 1,
            pending_gold = pending_gold + 1,
            current_streak = current_streak + 1,
            last_vote_at = NOW()
        WHERE realm_key = ? AND account_id = ?
      `, [realm.key, account.id]);

      if (intent) {
        await conn.execute("UPDATE frozenthrone.vote_intents SET consumed_at = NOW() WHERE id = ?", [intent.id]);
      }

      await conn.commit();
      await logResult(`credited_${realm.key}`);
      return res.send("OK");
    } catch (err) {
      try { await conn.rollback(); } catch {}
      await logResult("error");
      console.error("topg callback failed", err);
      return res.status(500).send("ERROR");
    } finally {
      await conn.end();
    }
  });

  function safeIdentifier(value) {
    const identifier = String(value || "");
    if (!/^[A-Za-z0-9_]+$/.test(identifier)) throw new Error("Invalid database identifier");
    return `\`${identifier}\``;
  }
};
