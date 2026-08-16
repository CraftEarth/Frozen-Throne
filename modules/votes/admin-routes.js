module.exports = function registerVoteAdminRoutes(app, tools) {
  const { render, esc, mysql, dbConfig, requireGM, requireOwner, requireAdminCsrf, csrfField, isAdminOwner } = tools;

  function safeIdentifier(value) {
    const identifier = String(value || "");
    if (!/^[A-Za-z0-9_]+$/.test(identifier)) throw new Error("Invalid database identifier");
    return `\`${identifier}\``;
  }

  app.get("/admin/votes", requireGM, async (req, res) => {
    const realm = req.activeRealm;
    const conn = await mysql.createConnection({ ...dbConfig, database: "frozenthrone" });

    try {
      const authDb = safeIdentifier(realm.auth_db);
      const [rows] = await conn.execute(`
        SELECT
          account.id AS account_id,
          account.username,
          COALESCE(wallet.lifetime_votes, 0) AS lifetime_votes,
          COALESCE(wallet.vote_tokens, 0) AS vote_tokens,
          COALESCE(wallet.pending_gold, 0) AS pending_gold,
          COALESCE(wallet.current_streak, 0) AS current_streak,
          wallet.last_vote_at,
          CASE
            WHEN wallet.last_vote_at IS NULL THEN 'Never Voted'
            WHEN wallet.last_vote_at > DATE_SUB(NOW(), INTERVAL 6 HOUR) THEN 'Voted Recently'
            ELSE 'Can Vote'
          END AS vote_status
        FROM ${authDb}.account account
        LEFT JOIN frozenthrone.vote_accounts wallet
          ON wallet.realm_key = ?
         AND wallet.account_id = account.id
        ORDER BY COALESCE(wallet.last_vote_at, '1970-01-01') DESC, account.username ASC
      `, [realm.key]);

      const tableRows = rows.map(row => `
        <tr>
          <td>${esc(row.account_id)}</td>
          <td><strong>${esc(row.username)}</strong></td>
          <td>${esc(row.lifetime_votes)}</td>
          <td>${esc(row.vote_tokens)}</td>
          <td>${esc(row.pending_gold)}g</td>
          <td>${esc(row.current_streak)}</td>
          <td>${esc(row.last_vote_at || "Never")}</td>
          <td>${esc(row.vote_status)}</td>
          <td>${isAdminOwner(req) ? `<a class="btn secondary" href="/admin/votes/account/${esc(row.account_id)}">Adjust</a>` : "Master only"}</td>
        </tr>
      `).join("");

      render(req, res, `${realm.name} Vote Tracker`, `
        <main class="container admin-control cms-compact">
          <section>
            <div class="section-head">
              <p class="eyebrow">${esc(realm.name)} Admin OS</p>
              <h1>Vote Tracker</h1>
              <p>Realm-safe vote balances, pending gold, streaks, and cooldown status.</p>
            </div>

            <div class="card">
              <h3>${esc(realm.name)} Account Voting Status</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>Account</th><th>Votes</th><th>Tokens</th>
                      <th>Pending Gold</th><th>Streak</th><th>Last Vote</th><th>Status</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>${tableRows || `<tr><td colspan="9">No accounts found.</td></tr>`}</tbody>
                </table>
              </div>
            </div>
          </section>
        </main>
      `);
    } catch (err) {
      console.error("vote admin failed", err);
      render(req, res, "Vote Tracker Error", `<main class="container"><div class="card"><h3>Vote Tracker Error</h3><p>${esc(err.message)}</p></div></main>`);
    } finally {
      await conn.end();
    }
  });

  app.get("/admin/votes/account/:id", requireOwner, async (req, res) => {
    const realm = req.activeRealm;
    const accountId = Number(req.params.id);
    if (!Number.isSafeInteger(accountId) || accountId < 1) return res.status(400).send("Invalid account.");
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: "frozenthrone" });
      const authDb = safeIdentifier(realm.auth_db);
      const [[account]] = await conn.execute(`SELECT id, username FROM ${authDb}.account WHERE id = ? LIMIT 1`, [accountId]);
      if (!account) return res.status(404).send("Account not found on the selected realm.");
      const [[wallet]] = await conn.execute(`SELECT vote_tokens, lifetime_votes, pending_gold FROM frozenthrone.vote_accounts WHERE realm_key = ? AND account_id = ?`, [realm.key, accountId]);
      const [history] = await conn.execute(`SELECT adjustment, balance_before, balance_after, reason, actor_username, created_at FROM frozenthrone.admin_point_adjustments WHERE realm_key = ? AND account_id = ? ORDER BY id DESC LIMIT 30`, [realm.key, accountId]);
      const historyRows = history.map(row => `<tr><td>${Number(row.adjustment) > 0 ? "+" : ""}${esc(row.adjustment)}</td><td>${esc(row.balance_before)} → ${esc(row.balance_after)}</td><td>${esc(row.reason)}</td><td>${esc(row.actor_username)}</td><td>${esc(new Date(row.created_at).toLocaleString())}</td></tr>`).join("");
      render(req, res, `Adjust ${account.username} Points`, `<link rel="stylesheet" href="/admin/admin.css"><main class="container admin-os"><section class="admin-os-hero"><div><p class="eyebrow">${esc(realm.name)} Reward Wallet</p><h1>${esc(account.username)}</h1><p>Add or subtract Vote Tokens. Every adjustment requires a reason and is permanently audited.</p></div><div class="admin-danger-chip">CURRENT BALANCE<strong>${esc(wallet?.vote_tokens || 0)} Tokens</strong></div></section><div class="admin-two-column"><section class="card"><h2>Adjust Vote Tokens</h2><form method="POST" action="/admin/votes/account/${esc(accountId)}/adjust" onsubmit="return confirm('Apply this Vote Token adjustment to ${esc(account.username)}?');">${csrfField(req)}<label>Action</label><select name="direction"><option value="add">Add Tokens</option><option value="subtract">Subtract Tokens</option></select><label>Amount</label><input name="amount" type="number" min="1" max="1000000" required><label>Required Reason</label><textarea name="reason" rows="4" minlength="5" maxlength="500" required placeholder="Event reward, correction, refund, or disciplinary adjustment"></textarea><button class="btn" type="submit">Apply Adjustment</button><a class="btn secondary" href="/admin/votes">Cancel</a></form></section><section class="card"><h2>Wallet Details</h2><div class="admin-stat-grid"><div><span>Vote Tokens</span><strong>${esc(wallet?.vote_tokens || 0)}</strong></div><div><span>Lifetime Votes</span><strong>${esc(wallet?.lifetime_votes || 0)}</strong></div><div><span>Pending Gold</span><strong>${esc(wallet?.pending_gold || 0)}g</strong></div></div></section></div><section class="card"><h2>Adjustment History</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>Change</th><th>Balance</th><th>Reason</th><th>Admin</th><th>Date</th></tr></thead><tbody>${historyRows || `<tr><td colspan="5">No manual adjustments.</td></tr>`}</tbody></table></div></section></main>`);
    } catch (err) {
      console.error("vote adjustment page failed", err);
      render(req, res, "Point Adjustment Error", `<main class="container"><div class="card"><h3>Point Adjustment Error</h3><p>${esc(err.message)}</p></div></main>`);
    } finally { if (conn) await conn.end(); }
  });

  app.post("/admin/votes/account/:id/adjust", requireOwner, requireAdminCsrf, async (req, res) => {
    const realm = req.activeRealm;
    const accountId = Number(req.params.id);
    const amount = Number(req.body.amount);
    const direction = req.body.direction === "subtract" ? "subtract" : "add";
    const reason = String(req.body.reason || "").trim();
    if (!Number.isSafeInteger(accountId) || accountId < 1 || !Number.isSafeInteger(amount) || amount < 1 || amount > 1000000 || reason.length < 5 || reason.length > 500) return res.status(400).send("Invalid point adjustment.");
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: "frozenthrone" });
      await conn.beginTransaction();
      const authDb = safeIdentifier(realm.auth_db);
      const [[account]] = await conn.execute(`SELECT id, username FROM ${authDb}.account WHERE id = ? LIMIT 1`, [accountId]);
      if (!account) throw new Error("Account not found on the selected realm.");
      await conn.execute(`INSERT IGNORE INTO frozenthrone.vote_accounts (account_id, realm_key, lifetime_votes, vote_tokens, pending_gold, current_streak, last_vote_at) VALUES (?, ?, 0, 0, 0, 0, NULL)`, [accountId, realm.key]);
      const [[wallet]] = await conn.execute(`SELECT vote_tokens FROM frozenthrone.vote_accounts WHERE realm_key = ? AND account_id = ? FOR UPDATE`, [realm.key, accountId]);
      const before = Number(wallet.vote_tokens || 0);
      const delta = direction === "subtract" ? -amount : amount;
      const after = before + delta;
      if (after < 0) throw new Error(`Cannot subtract ${amount} tokens. The current balance is ${before}.`);
      await conn.execute(`UPDATE frozenthrone.vote_accounts SET vote_tokens = ? WHERE realm_key = ? AND account_id = ?`, [after, realm.key, accountId]);
      await conn.execute(`INSERT INTO frozenthrone.admin_point_adjustments (realm_key, account_id, account_username, balance_before, adjustment, balance_after, reason, actor_account_id, actor_username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [realm.key, accountId, account.username, before, delta, after, reason, req.user.id, req.user.username]);
      await conn.execute(`INSERT INTO frozenthrone.admin_audit_events (actor_account_id, actor_username, actor_realm_key, action, target_type, target_key, details_json) VALUES (?, ?, ?, 'points.vote_tokens.adjust', 'account', ?, ?)`, [req.user.id, req.user.username, req.user.realmKey, `${realm.key}:${accountId}`, JSON.stringify({ username: account.username, before, delta, after, reason })]);
      await conn.commit();
      res.redirect(`/admin/votes/account/${accountId}`);
    } catch (err) {
      if (conn) try { await conn.rollback(); } catch {}
      res.status(400).send(esc(err.message));
    } finally { if (conn) await conn.end(); }
  });
};
