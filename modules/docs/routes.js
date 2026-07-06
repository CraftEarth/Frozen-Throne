const { listDocs, readDoc, writeDoc } = require("./engine");

module.exports = function registerDocsRoutes(app, tools) {
  const { render, requireGM, esc, errorCard } = tools;

  app.get("/admin/docs", requireGM, (req, res) => {
    const docs = listDocs();
    const file = docs.includes(req.query.file) ? req.query.file : (docs[0] || "PROJECT.md");

    let content = "";
    try {
      content = readDoc(file);
    } catch {
      return render(req, res, "Docs Error", errorCard("Could not read document."));
    }

    const links = docs.map(d =>
      `<a class="btn ${d === file ? "" : "secondary"}" href="/admin/docs?file=${encodeURIComponent(d)}">${esc(d)}</a>`
    ).join("");

    render(req, res, "Documentation Manager", `
      <main class="container admin-control cms-compact">
        <section>
          <div class="section-head">
            <p class="eyebrow">FrozenThrone Admin OS</p>
            <h1>Documentation Manager</h1>
            <p>Edit the project memory files without using nano.</p>
          </div>

          <div class="card cms-toolbar">
            ${links}
            <a class="btn secondary" href="/admin">Back to Admin</a>
          </div>

          <div class="card cms-editor">
            <form method="POST" action="/admin/docs/save">
              <input type="hidden" name="file" value="${esc(file)}">
              <label>Editing ${esc(file)}</label>
              <textarea name="content" rows="30" spellcheck="false">${esc(content)}</textarea>
              <button class="btn" type="submit">Save Document</button>
              <a class="btn secondary" href="/admin/docs?file=${encodeURIComponent(file)}">Reload</a>
            </form>
          </div>
        </section>
      </main>
    `);
  });

  app.post("/admin/docs/save", requireGM, (req, res) => {
    try {
      writeDoc(String(req.body.file || ""), String(req.body.content || ""));
      res.redirect(`/admin/docs?file=${encodeURIComponent(req.body.file || "PROJECT.md")}`);
    } catch (err) {
      render(req, res, "Docs Error", errorCard("Could not save document."));
    }
  });
};
