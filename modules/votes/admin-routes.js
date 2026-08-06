module.exports = function registerVoteAdminRoutes(app, tools) {
  const { render, esc, mysql, dbConfig, requireGM } = tools;

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
                      <th>Pending Gold</th><th>Streak</th><th>Last Vote</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>${tableRows || `<tr><td colspan="8">No accounts found.</td></tr>`}</tbody>
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
};
