module.exports = function registerCommunityAdminRoutes(app, tools) {
  const { render, esc, dbConfig, mysql, requireGM } = tools;

  async function ftDb() {
    return mysql.createPool({
      ...dbConfig,
      database: "frozenthrone",
      waitForConnections: true,
      connectionLimit: 10
    });
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

      render(req, res, "Forum Manager", `
        <main class="container admin-control cms-compact">
          <section>
            <div class="section-head">
              <p class="eyebrow">FrozenThrone Admin OS</p>
              <h1>Forum Manager</h1>
              <p>Create and manage forum boards without touching SQL.</p>
            </div>

            <div class="card cms-editor">
              <h3>Create New Forum</h3>
              <form method="POST" action="/admin/forums/board/create">
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

  app.post("/admin/forums/board/create", requireGM, async (req, res) => {
    try {
      const conn = await ftDb();

      await conn.execute(`
        INSERT INTO forum_boards (category_id, realm_id, name, description, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `, [
        Number(req.body.category_id || 1),
        Number(req.body.realm_id || 0),
        String(req.body.name || "").trim(),
        String(req.body.description || "").trim(),
        Number(req.body.sort_order || 99)
      ]);

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

  app.post("/admin/forums/board/:id/edit", requireGM, async (req, res) => {
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

      res.redirect("/admin/forums");
    } catch (err) {
      render(req, res, "Save Forum Error", `<main class="container"><div class="card"><h3>Save Forum Error</h3><p>${esc(err.message)}</p></div></main>`);
    }
  });

};
