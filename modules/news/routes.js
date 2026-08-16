const { readPosts, writePosts, readCategories, writeCategories, getContentTypes, slugify } = require("./engine");
const registerPublicNewsRoutes = require("./public-routes");

module.exports = function registerNewsRoutes(app, tools) {
  const { render, requireGM, esc, errorCard, requireAdminCsrf, csrfField, mysql, dbConfig } = tools;

  async function audit(req, action, targetKey, details = {}) {
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: "frozenthrone" });
      await conn.execute(`INSERT INTO admin_audit_events (actor_account_id, actor_username, actor_realm_key, action, target_type, target_key, details_json) VALUES (?, ?, ?, ?, 'news_category', ?, ?)`, [req.user.id, req.user.username, req.user.realmKey, action, String(targetKey), JSON.stringify(details)]);
    } catch (err) { console.error("news category audit failed", err.message); }
    finally { if (conn) await conn.end(); }
  }

  registerPublicNewsRoutes(app, { render, esc, errorCard });

  app.get("/admin/news", requireGM, (req, res) => res.redirect("/admin/content"));

  app.get("/admin/content", requireGM, (req, res) => {
    const posts = readPosts().sort((a, b) => Number(b.id) - Number(a.id));

    const rows = posts.map(p => `
      <tr>
        <td>${esc(p.id)}</td>
        <td><a href="/admin/content/${p.id}/edit"><strong>${esc(p.title)}</strong></a></td>
        <td>${esc(p.type)}</td>
        <td>${esc(p.status)}</td>
        <td>${esc(p.pinned ? "Yes" : "No")}</td>
        <td>${esc(p.createdAt || "")}</td>
      </tr>
    `).join("");

    render(req, res, "Content Manager", `
      <main class="container admin-control">
        <section>
          <div class="section-head">
            <p class="eyebrow">FrozenThrone Content Engine</p>
            <h1>Content Manager</h1>
            <p>Create news, patch notes, events, maintenance posts, spotlights, screenshots, and guides.</p>
          </div>

          <div class="card highlight">
            <a class="btn" href="/admin/content/new">+ New Post</a>
            <a class="btn secondary" href="/admin/content/categories">Manage Categories</a>
            <a class="btn secondary" href="/admin">Back to Admin</a>
          </div>

          <div class="card">
            <h3>Posts</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>Title</th><th>Type</th><th>Status</th><th>Pinned</th><th>Date</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="6">No posts yet.</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    `);
  });

  app.get(["/admin/content/new", "/admin/content/:id/edit"], requireGM, (req, res) => {
    const posts = readPosts();
    const post = req.params.id
      ? posts.find(p => Number(p.id) === Number(req.params.id))
      : {
          id: "",
          title: "",
          slug: "",
          type: "News",
          summary: "",
          body: "",
          status: "draft",
          pinned: false,
          featured: false,
          realmKey: "all",
          heroImage: "/images/frozenthrone-bg.jpeg",
          createdAt: new Date().toISOString().slice(0, 10)
        };

    if (!post) return render(req, res, "Content Manager", errorCard("Post not found."));

    const availableTypes = getContentTypes({ includeInactive: true });
    if (post.type && !availableTypes.includes(post.type)) availableTypes.push(post.type);
    const typeOptions = availableTypes.map(t =>
      `<option value="${esc(t)}" ${post.type === t ? "selected" : ""}>${esc(t)}</option>`
    ).join("");

    render(req, res, "Content Editor", `
      <main class="container admin-control">
        <section>
          <div class="section-head">
            <p class="eyebrow">FrozenThrone Content Engine</p>
            <h1>${post.id ? "Edit Post" : "New Post"}</h1>
            <p>CMS v1 editor. Rich editor and image upload come after save/publish works.</p>
          </div>

          <div class="card highlight">
            <form method="POST" action="/admin/content/save">
              ${csrfField(req)}
              <input type="hidden" name="id" value="${esc(post.id)}">

              <label>Title</label>
              <input name="title" value="${esc(post.title)}" required>

              <label>Slug</label>
              <input name="slug" value="${esc(post.slug)}" placeholder="patch-1-0-1">

              <label>Content Type</label>
              <select name="type">${typeOptions}</select>

              <label>Realm Scope</label>
              <select name="realmKey">
                <option value="all" ${(post.realmKey || "all") === "all" ? "selected" : ""}>All Realms</option>
                <option value="main" ${post.realmKey === "main" ? "selected" : ""}>FrozenThrone</option>
                <option value="shadowmourne" ${post.realmKey === "shadowmourne" ? "selected" : ""}>Shadowmourne</option>
              </select>

              <label>Summary</label>
              <input name="summary" value="${esc(post.summary || "")}">

              <label>Hero Image URL</label>
              <input name="heroImage" value="${esc(post.heroImage || "")}">

              <label>Date</label>
              <input name="createdAt" value="${esc(post.createdAt || "")}">

              <label>Status</label>
              <select name="status">
                <option value="draft" ${post.status === "draft" ? "selected" : ""}>Draft</option>
                <option value="published" ${post.status === "published" ? "selected" : ""}>Published</option>
              </select>

              <label><input type="checkbox" name="pinned" value="1" ${post.pinned ? "checked" : ""}> Pin this post</label>
              <label><input type="checkbox" name="featured" value="1" ${post.featured ? "checked" : ""}> Feature this post</label>

              <label>Body HTML</label>
              <textarea name="body" rows="14">${esc(post.body || "")}</textarea>

              <button class="btn" type="submit">Save Post</button>
              <a class="btn secondary" href="/admin/content">Cancel</a>
            </form>
          </div>
        </section>
      </main>
    `);
  });

  app.post("/admin/content/save", requireGM, requireAdminCsrf, (req, res) => {
    const posts = readPosts();
    const id = Number(req.body.id);
    const nextId = posts.length ? Math.max(...posts.map(p => Number(p.id) || 0)) + 1 : 1;

    const contentTypes = getContentTypes();
    const post = {
      id: id || nextId,
      title: String(req.body.title || "Untitled").trim(),
      slug: slugify(req.body.slug || req.body.title),
      type: contentTypes.includes(req.body.type) ? req.body.type : (contentTypes[0] || "News"),
      realmKey: ["main", "shadowmourne"].includes(req.body.realmKey) ? req.body.realmKey : "all",
      summary: String(req.body.summary || "").trim(),
      body: String(req.body.body || "").trim(),
      status: req.body.status === "published" ? "published" : "draft",
      pinned: req.body.pinned === "1",
      featured: req.body.featured === "1",
      heroImage: String(req.body.heroImage || "").trim(),
      createdAt: String(req.body.createdAt || new Date().toISOString().slice(0, 10)).trim(),
      updatedAt: new Date().toISOString()
    };

    const idx = posts.findIndex(p => Number(p.id) === post.id);
    if (idx >= 0) posts[idx] = post;
    else posts.push(post);

    writePosts(posts);
    res.redirect("/admin/content");
  });

  app.get("/admin/content/categories", requireGM, (req, res) => {
    const categories = readCategories().sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    const rows = categories.map(category => `
      <form method="POST" action="/admin/content/category/${esc(category.id)}" class="admin-inline-edit">
        ${csrfField(req)}
        <input name="name" value="${esc(category.name)}" required>
        <input name="sortOrder" type="number" value="${esc(category.sortOrder || 0)}">
        <label><input type="checkbox" name="active" value="1" ${category.active !== false ? "checked" : ""}> Active</label>
        <button class="btn secondary" type="submit">Save</button>
      </form>`).join("");

    render(req, res, "News Categories", `
      <link rel="stylesheet" href="/admin/admin.css">
      <main class="container admin-os"><section class="section-head"><p class="eyebrow">FrozenThrone Content Engine</p><h1>News Categories</h1><p>Create and organize the choices available to every news post.</p></section>
        <div class="admin-two-column">
          <section class="card"><h2>Current Categories</h2><div class="admin-edit-stack">${rows || `<p>No categories found.</p>`}</div></section>
          <section class="card"><h2>Create Category</h2><form method="POST" action="/admin/content/category">${csrfField(req)}<label>Name</label><input name="name" required placeholder="Developer Diaries"><label>Sort Order</label><input name="sortOrder" type="number" value="99"><button class="btn" type="submit">Create Category</button><a class="btn secondary" href="/admin/content">Back to Posts</a></form></section>
        </div>
      </main>`);
  });

  app.post("/admin/content/category", requireGM, requireAdminCsrf, async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).send("Category name is required.");
    const categories = readCategories();
    if (categories.some(category => category.name.toLowerCase() === name.toLowerCase())) return res.status(400).send("That news category already exists.");
    const id = categories.length ? Math.max(...categories.map(category => Number(category.id) || 0)) + 1 : 1;
    const category = { id, name, slug: slugify(name), sortOrder: Number(req.body.sortOrder || 99), active: true };
    categories.push(category);
    writeCategories(categories);
    await audit(req, "news.category.create", id, category);
    res.redirect("/admin/content/categories");
  });

  app.post("/admin/content/category/:id", requireGM, requireAdminCsrf, async (req, res) => {
    const id = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const categories = readCategories();
    const category = categories.find(item => Number(item.id) === id);
    if (!category || !name) return res.status(400).send("Invalid news category.");
    if (categories.some(item => Number(item.id) !== id && item.name.toLowerCase() === name.toLowerCase())) return res.status(400).send("That news category already exists.");
    const oldName = category.name;
    category.name = name;
    category.slug = slugify(name);
    category.sortOrder = Number(req.body.sortOrder || 0);
    category.active = req.body.active === "1";
    writeCategories(categories);
    if (oldName !== name) {
      const posts = readPosts();
      for (const post of posts) {
        if (post.type === oldName || post.category === oldName) {
          post.type = name;
          post.category = name;
        }
      }
      writePosts(posts);
    }
    await audit(req, "news.category.update", id, { oldName, name, active: category.active });
    res.redirect("/admin/content/categories");
  });
};
