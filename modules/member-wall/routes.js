const crypto = require("crypto");

module.exports = function registerMemberWallRoutes(app, deps) {
  const { authDb, requireLogin } = deps;
  const postTimes = new Map();
  let tableReady;

  function ensureTable() {
    if (!tableReady) {
      tableReady = (async () => {
        const conn = await authDb("main");

        try {
          await conn.execute(`
            CREATE TABLE IF NOT EXISTS frozenthrone.member_wall_messages (
              id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
              account_id INT UNSIGNED NOT NULL,
              username VARCHAR(32) NOT NULL,
              realm_key VARCHAR(32) NOT NULL,
              body VARCHAR(300) NOT NULL,
              is_pinned TINYINT(1) NOT NULL DEFAULT 0,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              deleted_at TIMESTAMP NULL DEFAULT NULL,
              PRIMARY KEY (id),
              KEY idx_wall_created (deleted_at, is_pinned, id),
              KEY idx_wall_account (account_id, realm_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
              COLLATE=utf8mb4_unicode_ci
          `);
        } finally {
          await conn.end();
        }
      })();
    }

    return tableReady;
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

  app.get("/api/member-wall", async (req, res) => {
    let conn;

    try {
      await ensureTable();

      const requested = Number(req.query.limit || 5);
      const limit = Math.max(1, Math.min(20, requested));

      conn = await authDb("main");

      const [messages] = await conn.execute(`
        SELECT
          m.id,
          COALESCE(p.public_handle, 'FrozenThrone Member') AS public_handle,
          COALESCE(p.public_slug, '') AS public_slug,
          m.realm_key,
          m.body,
          m.is_pinned,
          m.created_at
        FROM frozenthrone.member_wall_messages m
        LEFT JOIN frozenthrone.member_profiles p
          ON p.username = UPPER(m.username)
        WHERE m.deleted_at IS NULL
        ORDER BY m.is_pinned DESC, m.id DESC
        LIMIT ${limit}
      `);

      res.setHeader("Cache-Control", "no-store");

      res.json({
        messages: messages.map(message => ({
          id: Number(message.id),
          username: String(message.public_handle || "FrozenThrone Member"),
          profileSlug: String(message.public_slug || ""),
          realmKey: String(message.realm_key || "main"),
          body: String(message.body || ""),
          pinned: Number(message.is_pinned || 0) === 1,
          createdAt: message.created_at
        }))
      });
    } catch (error) {
      console.error("Member wall read failed:", error);
      res.status(500).json({
        error: "wall_unavailable",
        message: "The Tavern wall is temporarily unavailable."
      });
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  app.post("/api/member-wall", requireLogin, async (req, res) => {
    let conn;

    try {
      if (!validCsrf(req)) {
        return res.status(403).json({
          error: "invalid_token",
          message: "Your session expired. Refresh the page and try again."
        });
      }

      const body = String(req.body?.message || "")
        .replace(/\s+/g, " ")
        .trim();

      if (body.length < 2) {
        return res.status(400).json({
          error: "message_too_short",
          message: "Write at least two characters."
        });
      }

      if (body.length > 300) {
        return res.status(400).json({
          error: "message_too_long",
          message: "Messages cannot exceed 300 characters."
        });
      }

      const rateKey = `${req.user.realmKey}:${req.user.id}`;
      const lastPost = Number(postTimes.get(rateKey) || 0);
      const waitMs = 30000 - (Date.now() - lastPost);

      if (waitMs > 0) {
        return res.status(429).json({
          error: "posting_too_fast",
          message: `Please wait ${Math.ceil(waitMs / 1000)} seconds before posting again.`
        });
      }

      await ensureTable();
      conn = await authDb("main");

      const [result] = await conn.execute(`
        INSERT INTO frozenthrone.member_wall_messages
          (account_id, username, realm_key, body)
        VALUES (?, ?, ?, ?)
      `, [
        Number(req.user.id),
        String(req.user.username || "PLAYER").slice(0, 32),
        String(req.activeRealm?.key || req.user.realmKey || "main").slice(0, 32),
        body
      ]);

      postTimes.set(rateKey, Date.now());

      res.status(201).json({
        success: true,
        id: Number(result.insertId)
      });
    } catch (error) {
      console.error("Member wall post failed:", error);
      res.status(500).json({
        error: "post_failed",
        message: "Your Tavern message could not be posted."
      });
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  });

  ensureTable().catch(error => {
    console.error("Member wall table initialization failed:", error);
  });
};
