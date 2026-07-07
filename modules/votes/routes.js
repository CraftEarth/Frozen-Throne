module.exports = function registerVoteRoutes(app, tools) {
  const { mysql, dbConfig, requireLogin } = tools;

  async function ftDb() {
    return mysql.createPool({
      ...dbConfig,
      database: "frozenthrone",
      waitForConnections: true,
      connectionLimit: 10
    });
  }

  app.get("/vote/start/topg", requireLogin, async (req, res) => {
    const username = String(req.user.username || "")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 50);

    res.redirect(`https://topg.org/wow-private-servers/server-683511-${encodeURIComponent(username)}#vote`);
  });

  app.get("/vote/callback/topg", async (req, res) => {
    const conn = await ftDb();

    try {
      const param = String(req.query.p_resp || "").trim();
      const voteIp = String(req.query.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "");

      await conn.execute(`
        INSERT INTO vote_callback_debug (site, ip, query_payload)
        VALUES ('topg', ?, ?)
      `, [voteIp, JSON.stringify(req.query)]);

      const username = param.replace(/[^A-Za-z0-9_-]/g, "");

      const [[acct]] = await conn.execute(`
        SELECT id FROM auth.account WHERE UPPER(username) = UPPER(?) LIMIT 1
      `, [username]);

      if (!acct) {
        await conn.end();
        return res.status(404).send("ACCOUNT_NOT_FOUND");
      }

      const accountId = acct.id;

      const [[recent]] = await conn.execute(`
        SELECT last_vote_at
        FROM vote_accounts
        WHERE account_id = ?
          AND last_vote_at IS NOT NULL
          AND last_vote_at > DATE_SUB(NOW(), INTERVAL 6 HOUR)
        LIMIT 1
      `, [accountId]);

      if (recent) {
        await conn.end();
        return res.send("COOLDOWN");
      }

      await conn.execute(`
        INSERT INTO vote_logs (account_id, site, vote_code, ip, reward_tokens, reward_gold, callback_payload)
        VALUES (?, 'topg', ?, ?, 1, 1, ?)
      `, [accountId, param, voteIp, JSON.stringify(req.query)]);

      await conn.execute(`
        INSERT INTO vote_accounts (account_id, lifetime_votes, vote_tokens, current_streak, last_vote_at)
        VALUES (?, 1, 1, 1, NOW())
        ON DUPLICATE KEY UPDATE
          lifetime_votes = lifetime_votes + 1,
          vote_tokens = vote_tokens + 1,
          current_streak = current_streak + 1,
          last_vote_at = NOW()
      `, [accountId]);

      await conn.end();
      res.send("OK");
    } catch (err) {
      try { await conn.end(); } catch {}
      console.error("topg callback failed", err);
      res.status(500).send("ERROR");
    }
  });
};
