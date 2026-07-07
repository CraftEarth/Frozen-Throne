module.exports = function registerCommunityRoutes(app, tools) {
  const { render, esc, dbConfig, mysql, requireLogin, requireGM } = tools;

  function wowClassIcon(id) {
    return {
      1:"⚔️",2:"🛡️",3:"🏹",4:"🗡️",5:"✨",
      6:"💀",7:"⚡",8:"🔮",9:"🔥",11:"🌿"
    }[Number(id)] || "❔";
  }

  function wowClassName(id) {
    return {
      1:"Warrior",2:"Paladin",3:"Hunter",4:"Rogue",5:"Priest",
      6:"Death Knight",7:"Shaman",8:"Mage",9:"Warlock",11:"Druid"
    }[Number(id)] || "Unknown Class";
  }

  function wowRaceName(id) {
    return {
      1:"Human",2:"Orc",3:"Dwarf",4:"Night Elf",5:"Undead",
      6:"Tauren",7:"Gnome",8:"Troll",10:"Blood Elf",11:"Draenei"
    }[Number(id)] || "Unknown Race";
  }

  function niceDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  async function ftDb() {
    return mysql.createPool({
      ...dbConfig,
      database: "frozenthrone",
      waitForConnections: true,
      connectionLimit: 10
    });
  }

  app.get("/forums", async (req, res) => {
    try {
      const conn = await ftDb();

      const [categories] = await conn.execute(`
        SELECT id, name, description, sort_order
        FROM forum_categories
        ORDER BY sort_order, id
      `);

      const [boards] = await conn.execute(`
        SELECT
          b.id,
          b.category_id,
          b.name,
          b.description,
          b.icon,
          b.sort_order,
          COUNT(DISTINCT t.id) AS thread_count,
          COUNT(p.id) AS post_count,
          latest.id AS latest_thread_id,
          latest.title AS latest_title,
          latest.thread_type AS latest_thread_type,
          latest.updated_at AS latest_updated_at,
          latest_author.username AS latest_username
        FROM forum_boards b
        LEFT JOIN forum_threads t ON t.board_id = b.id
        LEFT JOIN forum_posts p ON p.thread_id = t.id
        LEFT JOIN forum_threads latest ON latest.id = (
          SELECT t2.id
          FROM forum_threads t2
          WHERE t2.board_id = b.id
          ORDER BY t2.updated_at DESC
          LIMIT 1
        )
        LEFT JOIN auth.account latest_author ON latest_author.id = latest.author_id
        GROUP BY b.id, latest.id, latest.title, latest.updated_at, latest_author.username
        ORDER BY b.sort_order, b.id
      `);

      const boardsByCategory = {};
      for (const board of boards) {
        if (!boardsByCategory[board.category_id]) boardsByCategory[board.category_id] = [];
        boardsByCategory[board.category_id].push(board);
      }

      const html = categories.map(cat => `
        <div class="card">
          <h3>${esc(cat.name)}</h3>
          <p class="muted">${esc(cat.description || "")}</p>

          <div class="forum-board-list">
            ${(boardsByCategory[cat.id] || []).map(board => `
              <a class="classic-forum-row" href="/forums/board/${board.id}">
                <div class="classic-forum-icon">${esc(board.icon || "💬")}</div>

                <div class="classic-forum-main">
                  <strong>${esc(board.name)}</strong>
                  <p>${esc(board.description || "")}</p>
                </div>

                <div class="classic-forum-counts">
                  <span><strong>${esc(board.thread_count)}</strong><small>Threads</small></span>
                  <span><strong>${esc(board.post_count)}</strong><small>Posts</small></span>
                </div>

                <div class="classic-forum-last">
                  ${board.latest_thread_id
                    ? `<strong class="latest-${esc(board.latest_thread_type || "normal")}">${board.latest_thread_type === "urgent" ? "🚨 " : board.latest_thread_type === "important" ? "⭐ " : board.latest_thread_type === "announcement" ? "📢 " : board.latest_thread_type === "sticky" ? "📌 " : ""}${esc(board.latest_title)}</strong><br><small>by ${esc(board.latest_username || "Unknown")} · ${esc(niceDate(board.latest_updated_at))}</small>`
                    : `<small>No posts yet</small>`}
                </div>
              </a>
            `).join("")}
          </div>
        </div>
      `).join("");

      render(req, res, "Forums", `
        <main class="container">
          <section>
            <div class="section-head">
              <p class="eyebrow">FrozenThrone Community</p>
              <h1>Forums</h1>
              <p>Discuss the realm, guilds, PvP, trading, bugs, suggestions, and development.</p>
            </div>

            ${html || `<div class="card"><p>No forum boards found.</p></div>`}
          </section>
        </main>
      `);
    } catch (err) {
      render(req, res, "Forum Error", `
        <main class="container">
          <div class="card">
            <h3>Forum Error</h3>
            <p class="muted">${esc(err.message)}</p>
          </div>
        </main>
      `);
    }
  });

  app.get("/forums/board/:id", async (req, res) => {
    try {
      const conn = await ftDb();
      const boardId = Number(req.params.id);

      const [[board]] = await conn.execute(`
        SELECT b.*, c.name AS category_name
        FROM forum_boards b
        JOIN forum_categories c ON c.id = b.category_id
        WHERE b.id = ?
      `, [boardId]);

      if (!board) {
        return render(req, res, "Forum Board", `
          <main class="container"><div class="card"><h3>Board not found.</h3></div></main>
        `);
      }

      const [threads] = await conn.execute(`
        SELECT t.*, a.username
        FROM forum_threads t
        LEFT JOIN auth.account a ON a.id = t.author_id
        WHERE t.board_id = ?
        ORDER BY t.pinned DESC, t.updated_at DESC
      `, [boardId]);

      const rows = threads.map(t => `
        <a class="forum-board-row thread-row thread-${esc(t.thread_type || "normal")}" href="/forums/thread/${t.id}">
          <div>
            <strong>${t.pinned ? "📌 " : ""}${t.thread_type === "urgent" ? "🚨 " : ""}${t.thread_type === "important" ? "⭐ " : ""}${esc(t.title)}</strong>
            <p>by ${esc(t.username || "Unknown")} · ${esc(t.created_at || "")}</p>
          </div>
          <span>${esc(t.replies || 0)} Replies</span>
        </a>
      `).join("");

      render(req, res, board.name, `
        <main class="container">
          <section>
            <div class="section-head">
              <p class="eyebrow">${esc(board.category_name)}</p>
              <h1>${esc(board.name)}</h1>
              <p>${esc(board.description || "")}</p>
            </div>

            <div class="card">
              ${req.user
                ? `<a class="btn" href="/forums/board/${board.id}/new">+ New Thread</a>`
                : `<p class="muted"><a href="/login?next=/forums/board/${board.id}">Login</a> to create a thread.</p>`}
            </div>

            <div class="card">
              <h3>Threads</h3>
              <div class="forum-board-list">
                ${rows || `<p class="muted">No threads yet. Be the first to post.</p>`}
              </div>
            </div>
          </section>
        </main>
      `);
    } catch (err) {
      render(req, res, "Forum Error", `<main class="container"><div class="card"><h3>Forum Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });


  app.get("/forums/board/:id/new", requireLogin, async (req, res) => {
    try {
      const conn = await ftDb();
      const boardId = Number(req.params.id);

      const [[board]] = await conn.execute(`
        SELECT *
        FROM forum_boards
        WHERE id = ?
      `, [boardId]);

      if (!board) {
        return render(req, res, "New Thread", `
          <main class="container"><div class="card"><h3>Board not found.</h3></div></main>
        `);
      }

      render(req, res, "New Thread", `
        <main class="container">
          <section>
            <div class="section-head">
              <p class="eyebrow">FrozenThrone Forums</p>
              <h1>New Thread</h1>
              <p>${esc(board.name)}</p>
            </div>

            <div class="card cms-editor">
              <form method="POST" action="/forums/board/${board.id}/new">
                <label>Title</label>
                <input name="title" required maxlength="200" placeholder="Thread title">

                <label>Thread Type</label>
                <select name="thread_type">
                  <option value="normal">Normal</option>
                  <option value="sticky">Sticky</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                </select>

                <label>Message</label>
                <textarea name="body" rows="12" required placeholder="Write your post..."></textarea>

                <button class="btn" type="submit">Create Thread</button>
                <a class="btn secondary" href="/forums/board/${board.id}">Cancel</a>
              </form>
            </div>
          </section>
        </main>
      `);
    } catch (err) {
      render(req, res, "Forum Error", `<main class="container"><div class="card"><h3>Forum Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });

  app.post("/forums/board/:id/new", requireLogin, async (req, res) => {
    try {
      const conn = await ftDb();
      const boardId = Number(req.params.id);
      const title = String(req.body.title || "").trim();
      const body = String(req.body.body || "").trim();
      const threadType = ["normal", "sticky", "announcement", "important", "urgent"].includes(req.body.thread_type)
        ? req.body.thread_type
        : "normal";

      if (title.length < 4) throw new Error("Thread title is too short.");
      if (body.length < 20) throw new Error("Thread message is too short.");

      const [[board]] = await conn.execute(`SELECT id FROM forum_boards WHERE id = ?`, [boardId]);
      if (!board) throw new Error("Board not found.");

      const [threadResult] = await conn.execute(`
        INSERT INTO forum_threads (board_id, author_id, title, replies, pinned, locked, thread_type)
        VALUES (?, ?, ?, 0, ?, 0, ?)
      `, [boardId, req.user.id, title, threadType === "sticky" ? 1 : 0, threadType]);

      const threadId = threadResult.insertId;

      await conn.execute(`
        INSERT INTO forum_posts (thread_id, author_id, body)
        VALUES (?, ?, ?)
      `, [threadId, req.user.id, body]);

      res.redirect(`/forums/thread/${threadId}`);
    } catch (err) {
      render(req, res, "Forum Error", `<main class="container"><div class="card"><h3>Forum Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });


  app.get("/forums/thread/:id", async (req, res) => {
    try {
      const conn = await ftDb();
      const threadId = Number(req.params.id);

      const [[thread]] = await conn.execute(`
        SELECT t.*, b.name AS board_name, a.username
        FROM forum_threads t
        JOIN forum_boards b ON b.id = t.board_id
        LEFT JOIN auth.account a ON a.id = t.author_id
        WHERE t.id = ?
      `, [threadId]);

      if (!thread) {
        return render(req, res, "Thread Not Found", `
          <main class="container"><div class="card"><h3>Thread not found.</h3></div></main>
        `);
      }

      let isForumGM = false;
      if (req.user && req.user.id) {
        const [[gmRow]] = await conn.execute(`
          SELECT SecurityLevel
          FROM auth.account_access
          WHERE AccountID = ?
          ORDER BY SecurityLevel DESC
          LIMIT 1
        `, [req.user.id]);

        isForumGM = Number(gmRow?.SecurityLevel || 0) >= 3;
      }

      await conn.execute(`UPDATE forum_threads SET views = views + 1 WHERE id = ?`, [threadId]);

      const [posts] = await conn.execute(`
        SELECT
          p.*,
          a.username,
          COALESCE(pc.post_count, 0) AS author_post_count,
          COALESCE(gm.SecurityLevel, 0) AS author_gm_level,
          mc.guid AS main_character_guid,
          mc.guid AS main_character_guid,
          mc.name AS main_character_name,
          mc.level AS main_character_level,
          mc.race AS main_character_race,
          mc.class AS main_character_class,
          g.name AS main_guild_name
        FROM forum_posts p
        LEFT JOIN auth.account a ON a.id = p.author_id
        LEFT JOIN (
          SELECT author_id, COUNT(*) AS post_count
          FROM forum_posts
          GROUP BY author_id
        ) pc ON pc.author_id = p.author_id
        LEFT JOIN auth.account_access gm ON gm.AccountID = p.author_id
        LEFT JOIN characters.characters mc ON mc.guid = (
          SELECT c2.guid
          FROM characters.characters c2
          WHERE c2.account = p.author_id
          ORDER BY c2.level DESC, c2.guid ASC
          LIMIT 1
        )
        LEFT JOIN characters.guild_member gmbr ON gmbr.guid = mc.guid
        LEFT JOIN characters.guild g ON g.guildid = gmbr.guildid
        WHERE p.thread_id = ?
        ORDER BY p.created_at ASC
      `, [threadId]);

      const postHtml = posts.map((p, index) => {
        const gmLevel = Number(p.author_gm_level || 0);
        const badges = [
          gmLevel >= 3 ? `<span class="forum-badge staff">Game Master</span>` : "",
          Number(p.author_id) === 3 ? `<span class="forum-badge founder">Founder</span>` : ""
        ].filter(Boolean).join("");

        return `
          <div class="card forum-post forum-post-grid class-${esc(p.main_character_class || 0)}">
            <aside class="forum-user-card">
              <div class="forum-avatar">${p.main_character_class ? esc(wowClassIcon(p.main_character_class)) : esc(String(p.username || "?").slice(0, 1).toUpperCase())}</div>
              <strong>${esc(p.username || "Unknown")}</strong>
              <div class="forum-title">${gmLevel >= 3 ? "FrozenThrone Staff" : "Adventurer"}</div>
              <div class="forum-badges">${badges}</div>

              ${p.main_character_name ? `
                <div class="forum-character-card class-${esc(p.main_character_class || 0)}">
                  <a class="forum-character-name" href="/armory/main/${esc(p.main_character_guid)}">${esc(p.main_character_name)}</a>
                  <span>Level ${esc(p.main_character_level || "?")} ${esc(wowRaceName(p.main_character_race))} ${esc(wowClassName(p.main_character_class))}</span>
                  ${p.main_guild_name ? `<small>Guild: ${esc(p.main_guild_name)}</small>` : ""}
                </div>
              ` : ""}

              <div class="forum-user-stats">
                <span>Posts</span><strong>${esc(p.author_post_count || 0)}</strong>
              </div>
            </aside>

            <article class="forum-post-content">
              <div class="forum-post-head">
                <span>${esc(niceDate(p.created_at))}</span>
                <span>#${index + 1}</span>
              </div>
              <div class="forum-post-body">${esc(p.body).replace(/\n/g, "<br>")}</div>
            </article>
          </div>
        `;
      }).join("");

      render(req, res, thread.title, `
        <main class="container">
          <section>
            <div class="section-head">
              <p class="eyebrow">${esc(thread.board_name)}</p>
              <h1>${esc(thread.title)}</h1>
              <p>Started by ${esc(thread.username || "Unknown")} · ${esc(thread.views || 0)} views</p>
            </div>

            ${postHtml || `<div class="card"><p class="muted">No posts found.</p></div>`}

            ${isForumGM ? `
              <div class="card cms-editor">
                <h3>GM Thread Tools</h3>
                <form method="POST" action="/forums/thread/${thread.id}/moderate">
                  <label>Thread Type</label>
                  <select name="thread_type">
                    <option value="normal" ${thread.thread_type === "normal" ? "selected" : ""}>Normal</option>
                    <option value="sticky" ${thread.thread_type === "sticky" ? "selected" : ""}>Sticky</option>
                    <option value="announcement" ${thread.thread_type === "announcement" ? "selected" : ""}>Announcement</option>
                    <option value="important" ${thread.thread_type === "important" ? "selected" : ""}>Important</option>
                    <option value="urgent" ${thread.thread_type === "urgent" ? "selected" : ""}>Urgent</option>
                  </select>

                  <label>Move To Board ID</label>
                  <input name="board_id" value="${esc(thread.board_id)}">

                  <label>Locked</label>
                  <select name="locked">
                    <option value="0" ${Number(thread.locked) ? "" : "selected"}>Unlocked</option>
                    <option value="1" ${Number(thread.locked) ? "selected" : ""}>Locked</option>
                  </select>

                  <button class="btn" type="submit">Save Thread Tools</button>
                </form>
              </div>
            ` : ""}

            <div class="card cms-editor">
              ${req.user ? `
                <form method="POST" action="/forums/thread/${thread.id}/reply">
                  <label>Reply</label>
                  <textarea name="body" rows="8" required placeholder="Write your reply..."></textarea>
                  <button class="btn" type="submit">Post Reply</button>
                </form>
              ` : `
                <p class="muted"><a href="/login?next=/forums/thread/${thread.id}">Login</a> to reply.</p>
              `}
            </div>

            <div class="card">
              <a class="btn secondary" href="/forums/board/${thread.board_id}">Back to ${esc(thread.board_name)}</a>
            </div>
          </section>
        </main>
      `);
    } catch (err) {
      render(req, res, "Forum Error", `<main class="container"><div class="card"><h3>Forum Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });

  app.post("/forums/thread/:id/reply", requireLogin, async (req, res) => {
    try {
      const conn = await ftDb();
      const threadId = Number(req.params.id);
      const body = String(req.body.body || "").trim();

      if (body.length < 10) throw new Error("Reply is too short.");

      const [[thread]] = await conn.execute(`SELECT id, locked FROM forum_threads WHERE id = ?`, [threadId]);
      if (!thread) throw new Error("Thread not found.");
      if (thread.locked) throw new Error("Thread is locked.");

      await conn.execute(`
        INSERT INTO forum_posts (thread_id, author_id, body)
        VALUES (?, ?, ?)
      `, [threadId, req.user.id, body]);

      await conn.execute(`
        UPDATE forum_threads
        SET replies = replies + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [threadId]);

      res.redirect(`/forums/thread/${threadId}`);
    } catch (err) {
      render(req, res, "Forum Error", `<main class="container"><div class="card"><h3>Forum Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });


  app.post("/forums/thread/:id/moderate", requireGM, async (req, res) => {
    try {
      const conn = await ftDb();
      const threadId = Number(req.params.id);

      const threadType = ["normal", "sticky", "announcement", "important", "urgent"].includes(req.body.thread_type)
        ? req.body.thread_type
        : "normal";

      const boardId = Number(req.body.board_id || 0);
      const locked = Number(req.body.locked || 0) ? 1 : 0;

      const [[board]] = await conn.execute(`SELECT id FROM forum_boards WHERE id = ?`, [boardId]);
      if (!board) throw new Error("Target board not found.");

      await conn.execute(`
        UPDATE forum_threads
        SET board_id = ?, thread_type = ?, pinned = ?, important = ?, announcement = ?, locked = ?
        WHERE id = ?
      `, [
        boardId,
        threadType,
        threadType === "sticky" ? 1 : 0,
        threadType === "important" ? 1 : 0,
        threadType === "announcement" ? 1 : 0,
        locked,
        threadId
      ]);

      res.redirect(`/forums/thread/${threadId}`);
    } catch (err) {
      render(req, res, "Moderation Error", `<main class="container"><div class="card"><h3>Moderation Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });

};
