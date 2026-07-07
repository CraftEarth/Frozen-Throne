module.exports = function registerVoteAdminRoutes(app, tools) {
  const { render, esc, mysql, dbConfig, requireGM } = tools;

  async function ftDb() {
    return mysql.createPool({
      ...dbConfig,
      database: "frozenthrone",
      waitForConnections: true,
      connectionLimit: 10
    });
  }

  app.get("/admin/votes", requireGM, async (req, res) => {
    try {
      const conn = await ftDb();

      const [rows] = await conn.execute(`
        SELECT
          a.id AS account_id,
          a.username,
          COALESCE(v.lifetime_votes, 0) AS lifetime_votes,
          COALESCE(v.vote_tokens, 0) AS vote_tokens,
          COALESCE(v.current_streak, 0) AS current_streak,
          v.last_vote_at,
          CASE
            WHEN v.last_vote_at IS NULL THEN 'Never Voted'
            WHEN v.last_vote_at > DATE_SUB(NOW(), INTERVAL 6 HOUR) THEN 'Voted Recently'
            ELSE 'Can Vote'
          END AS vote_status
        FROM auth.account a
        LEFT JOIN vote_accounts v ON v.account_id = a.id
        ORDER BY COALESCE(v.last_vote_at, '1970-01-01') DESC, a.username ASC
      `);

      const tableRows = rows.map(r => `
        <tr>
          <td>${esc(r.account_id)}</td>
          <td><strong>${esc(r.username)}</strong></td>
          <td>${esc(r.lifetime_votes)}</td>
          <td>${esc(r.vote_tokens)}</td>
          <td>${esc(r.current_streak)}</td>
          <td>${esc(r.last_vote_at || "Never")}</td>
          <td>${esc(r.vote_status)}</td>
        </tr>
      `).join("");

      render(req, res, "Vote Tracker", `
        <main class="container admin-control cms-compact">
          <section>
            <div class="section-head">
              <p class="eyebrow">FrozenThrone Admin OS</p>
              <h1>Vote Tracker</h1>
              <p>See who is voting, who is not voting, streaks, balances, and last vote times.</p>
            </div>

            <div class="card">
              <h3>Account Voting Status</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Account</th>
                      <th>Votes</th>
                      <th>Tokens</th>
                      <th>Streak</th>
                      <th>Last Vote</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>${tableRows || `<tr><td colspan="7">No accounts found.</td></tr>`}</tbody>
                </table>
              </div>
            </div>
          </section>
        </main>
      `);
    } catch (err) {
      render(req, res, "Vote Tracker Error", `<main class="container"><div class="card"><h3>Vote Tracker Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });
};
