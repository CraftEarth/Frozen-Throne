module.exports = function registerCommunityAdminRoutes(app, tools) {
  const { render, esc, dbConfig, mysql, requireGM, requireAdminCsrf, csrfField } = tools;

  const pool = mysql.createPool({
    ...dbConfig,
    database: "frozenthrone",
    waitForConnections: true,
    connectionLimit: 10
  });

  async function ftDb() {
    return pool;
  }

  async function audit(req, action, targetType, targetKey, details = {}) {
    try {
      await pool.execute(`INSERT INTO admin_audit_events (actor_account_id, actor_username, actor_realm_key, action, target_type, target_key, details_json) VALUES (?, ?, ?, ?, ?, ?, ?)`, [req.user.id, req.user.username, req.user.realmKey, action, targetType, String(targetKey), JSON.stringify(details)]);
    } catch (err) { console.error("forum admin audit failed", err.message); }
  }

  app.get("/admin/forums", requireGM, async (req, res) => {
    try {
      const conn = await ftDb();

      const [categories] = await conn.execute(`
        SELECT id, name, description, sort_order
        FROM forum_categories
        ORDER BY sort_order, id
      `);

      const [boards] = await conn.execute(`
        SELECT b.*, c.name AS category_name
        FROM forum_boards b
        JOIN forum_categories c ON c.id = b.category_id
        ORDER BY c.sort_order, b.sort_order, b.id
      `);

      const catOptions = categories.map(c =>
        `<option value="${esc(c.id)}">${esc(c.name)}</option>`
      ).join("");

      const rows = boards.map(b => `
        <tr>
          <td>${esc(b.id)}</td>
          <td><strong>${esc(b.name)}</strong><br><small>${esc(b.description || "")}</small></td>
          <td>${esc(b.category_name)}</td>
          <td>${esc(b.realm_id || 0)}</td>
          <td>${esc(b.sort_order || 0)}</td>
          <td><a class="btn secondary" href="/admin/forums/board/${b.id}/edit">Edit</a></td>
        </tr>
      `).join("");

      const categoryRows = categories.map(category => `
        <form class="admin-inline-edit" method="POST" action="/admin/forums/category/${esc(category.id)}">
          ${csrfField(req)}
          <input name="name" value="${esc(category.name)}" required>
          <input name="sort_order" type="number" value="${esc(category.sort_order || 0)}">
          <input name="description" value="${esc(category.description || "")}" placeholder="Category description">
          <button class="btn secondary" type="submit">Save</button>
        </form>`).join("");

      render(req, res, "Forum Manager", `
        <link rel="stylesheet" href="/admin/admin.css">
        <main class="container admin-control cms-compact">
          <section>
            <div class="section-head">
              <p class="eyebrow">FrozenThrone Admin OS</p>
              <h1>Forum Manager</h1>
              <p>Create and manage forum boards without touching SQL.</p>
            </div>

            <div class="admin-two-column">
              <div class="card cms-editor">
                <h3>Forum Categories</h3>
                <div class="admin-edit-stack">${categoryRows || `<p>No categories found.</p>`}</div>
              </div>
              <div class="card cms-editor">
                <h3>Create Category</h3>
                <form method="POST" action="/admin/forums/category/create">
                  ${csrfField(req)}
                  <label>Category Name</label><input name="name" required placeholder="Class Discussions">
                  <label>Description</label><input name="description" placeholder="Boards for every class and specialization.">
                  <label>Sort Order</label><input name="sort_order" type="number" value="99">
                  <button class="btn" type="submit">Create Category</button>
                </form>
              </div>
            </div>

            <div class="card cms-editor">
              <h3>Create New Forum</h3>
              <form method="POST" action="/admin/forums/board/create">
                ${csrfField(req)}
                <label>Forum Name</label>
                <input name="name" required placeholder="Death Knights">

                <label>Description</label>
                <input name="description" placeholder="Class discussion, builds, PvP, PvE, and guides.">

                <label>Category</label>
                <select name="category_id">${catOptions}</select>

                <label>Realm ID</label>
                <input name="realm_id" value="0">

                <label>Sort Order</label>
                <input name="sort_order" value="99">

                <button class="btn" type="submit">Create Forum</button>
                <a class="btn secondary" href="/forums">View Forums</a>
              </form>
            </div>

            <div class="card">
              <h3>Current Forums</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr><th>ID</th><th>Forum</th><th>Category</th><th>Realm</th><th>Sort</th><th>Actions</th></tr>
                  </thead>
                  <tbody>${rows || `<tr><td colspan="5">No forums found.</td></tr>`}</tbody>
                </table>
              </div>
            </div>
          </section>
        </main>
      `);
    } catch (err) {
      render(req, res, "Forum Manager Error", `
        <main class="container"><div class="card"><h3>Forum Manager Error</h3><p>${esc(err.message)}</p></div></main>
      `);
    }
  });

  app.post("/admin/forums/board/create", requireGM, requireAdminCsrf, async (req, res) => {
    try {
      const conn = await ftDb();

      const [result] = await conn.execute(`
        INSERT INTO forum_boards (category_id, realm_id, name, description, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `, [
        Number(req.body.category_id || 1),
        Number(req.body.realm_id || 0),
        String(req.body.name || "").trim(),
        String(req.body.description || "").trim(),
        Number(req.body.sort_order || 99)
      ]);

      await audit(req, "forum.board.create", "forum_board", result.insertId, { name: String(req.body.name || "").trim(), categoryId: Number(req.body.category_id || 1) });

      res.redirect("/admin/forums");
    } catch (err) {
      render(req, res, "Forum Create Error", `
        <main class="container"><div class="card"><h3>Forum Create Error</h3><p>${esc(err.message)}</p></div></main>
      `);
    }
  });

  app.get("/admin/forums/board/:id/edit", requireGM, async (req, res) => {
    try {
      const conn = await ftDb();
      const boardId = Number(req.params.id);

      const [[board]] = await conn.execute(`SELECT * FROM forum_boards WHERE id = ?`, [boardId]);
      const [categories] = await conn.execute(`SELECT id, name FROM forum_categories ORDER BY sort_order, id`);

      if (!board) {
        return render(req, res, "Edit Forum", `<main class="container"><div class="card"><h3>Forum not found.</h3></div></main>`);
      }

      const catOptions = categories.map(c =>
        `<option value="${esc(c.id)}" ${Number(c.id) === Number(board.category_id) ? "selected" : ""}>${esc(c.name)}</option>`
      ).join("");

      render(req, res, "Edit Forum", `
        <main class="container admin-control cms-compact">
          <section>
            <div class="section-head">
              <p class="eyebrow">FrozenThrone Admin OS</p>
              <h1>Edit Forum</h1>
              <p>${esc(board.name)}</p>
            </div>

            <div class="card cms-editor">
              <form method="POST" action="/admin/forums/board/${board.id}/edit">
                ${csrfField(req)}
                <label>Forum Name</label>
                <input name="name" required value="${esc(board.name)}">

                <label>Description</label>
                <input name="description" value="${esc(board.description || "")}">

                <label>Category</label>
                <select name="category_id">${catOptions}</select>

                <label>Realm ID</label>
                <input name="realm_id" value="${esc(board.realm_id || 0)}">

                <label>Sort Order</label>
                <input name="sort_order" value="${esc(board.sort_order || 0)}">

                <button class="btn" type="submit">Save Forum</button>
                <a class="btn secondary" href="/admin/forums">Cancel</a>
                <a class="btn secondary" href="/forums/board/${board.id}">View Forum</a>
              </form>
            </div>
          </section>
        </main>
      `);
    } catch (err) {
      render(req, res, "Edit Forum Error", `<main class="container"><div class="card"><h3>Edit Forum Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });

  app.post("/admin/forums/board/:id/edit", requireGM, requireAdminCsrf, async (req, res) => {
    try {
      const conn = await ftDb();

      await conn.execute(`
        UPDATE forum_boards
        SET category_id = ?, realm_id = ?, name = ?, description = ?, sort_order = ?
        WHERE id = ?
      `, [
        Number(req.body.category_id || 1),
        Number(req.body.realm_id || 0),
        String(req.body.name || "").trim(),
        String(req.body.description || "").trim(),
        Number(req.body.sort_order || 0),
        Number(req.params.id)
      ]);

      await audit(req, "forum.board.update", "forum_board", Number(req.params.id), { name: String(req.body.name || "").trim(), categoryId: Number(req.body.category_id || 1) });

      res.redirect("/admin/forums");
    } catch (err) {
      render(req, res, "Save Forum Error", `<main class="container"><div class="card"><h3>Save Forum Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });

  app.post("/admin/forums/category/create", requireGM, requireAdminCsrf, async (req, res) => {
    try {
      const name = String(req.body.name || "").trim();
      if (!name) throw new Error("Category name is required.");
      const [result] = await pool.execute(`INSERT INTO forum_categories (name, description, sort_order) VALUES (?, ?, ?)`, [name, String(req.body.description || "").trim(), Number(req.body.sort_order || 99)]);
      await audit(req, "forum.category.create", "forum_category", result.insertId, { name });
      res.redirect("/admin/forums");
    } catch (err) {
      render(req, res, "Forum Category Error", `<main class="container"><div class="card"><h3>Forum Category Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });

  app.post("/admin/forums/category/:id", requireGM, requireAdminCsrf, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const name = String(req.body.name || "").trim();
      if (!Number.isSafeInteger(id) || id < 1 || !name) throw new Error("Invalid category.");
      await pool.execute(`UPDATE forum_categories SET name = ?, description = ?, sort_order = ? WHERE id = ?`, [name, String(req.body.description || "").trim(), Number(req.body.sort_order || 0), id]);
      await audit(req, "forum.category.update", "forum_category", id, { name });
      res.redirect("/admin/forums");
    } catch (err) {
      render(req, res, "Forum Category Error", `<main class="container"><div class="card"><h3>Forum Category Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });

};
