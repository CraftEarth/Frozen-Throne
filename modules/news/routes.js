const { CONTENT_TYPES, readPosts, writePosts, slugify } = require("./engine");

module.exports = function registerNewsRoutes(app, tools) {
  const { render, requireGM, esc, errorCard } = tools;

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
          heroImage: "/images/frozenthrone-bg.jpeg",
          createdAt: new Date().toISOString().slice(0, 10)
        };

    if (!post) return render(req, res, "Content Manager", errorCard("Post not found."));

    const typeOptions = CONTENT_TYPES.map(t =>
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
              <input type="hidden" name="id" value="${esc(post.id)}">

              <label>Title</label>
              <input name="title" value="${esc(post.title)}" required>

              <label>Slug</label>
              <input name="slug" value="${esc(post.slug)}" placeholder="patch-1-0-1">

              <label>Content Type</label>
              <select name="type">${typeOptions}</select>

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

  app.post("/admin/content/save", requireGM, (req, res) => {
    const posts = readPosts();
    const id = Number(req.body.id);
    const nextId = posts.length ? Math.max(...posts.map(p => Number(p.id) || 0)) + 1 : 1;

    const post = {
      id: id || nextId,
      title: String(req.body.title || "Untitled").trim(),
      slug: slugify(req.body.slug || req.body.title),
      type: CONTENT_TYPES.includes(req.body.type) ? req.body.type : "News",
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
};
