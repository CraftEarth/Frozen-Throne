const path = require("path");
const { execFile } = require("child_process");

const SERVICE_DEFINITIONS = Object.freeze([
  { key: "main-auth", unit: "authserver.service", label: "FrozenThrone Authserver", realm: "FrozenThrone", group: "game" },
  { key: "main-world", unit: "worldserver.service", label: "FrozenThrone Worldserver", realm: "FrozenThrone", group: "game" },
  { key: "shadow-auth", unit: "frozenthrone-shadow-auth.service", label: "Shadowmourne Authserver", realm: "Shadowmourne", group: "game" },
  { key: "shadow-world", unit: "frozenthrone-shadow-world.service", label: "Shadowmourne Worldserver", realm: "Shadowmourne", group: "game" },
  { key: "solo-beta", unit: "worldserver-beta.service", label: "Solo Beta Worldserver", realm: "Solo Beta", group: "game" },
  { key: "website", unit: "frozenthrone-web.service", label: "FrozenThrone Website", realm: "Website", group: "website" }
]);

const serviceOperations = new Map();

module.exports = function registerAdminControlRoutes(app, tools) {
  const {
    render,
    esc,
    mysql,
    dbConfig,
    requireGM,
    requireOwner,
    requireAdminCsrf,
    csrfField,
    isAdminOwner,
    authDb,
    characterDb,
    worldDb,
    itemIconUrl
  } = tools;

  const centralDb = () => mysql.createConnection({ ...dbConfig, database: "frozenthrone" });

  async function audit(req, action, targetType, targetKey, details = {}) {
    let conn;
    try {
      conn = await centralDb();
      await conn.execute(`
        INSERT INTO admin_audit_events
          (actor_account_id, actor_username, actor_realm_key, action, target_type, target_key, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        Number(req.user?.id || 0),
        String(req.user?.username || "unknown"),
        String(req.user?.realmKey || "unknown"),
        String(action),
        String(targetType),
        String(targetKey),
        JSON.stringify(details)
      ]);
    } catch (err) {
      console.error("admin audit failed", err.message);
    } finally {
      if (conn) await conn.end();
    }
  }

  function systemctl(args, timeout = 45000) {
    return new Promise((resolve, reject) => {
      execFile("/bin/systemctl", args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          err.output = String(stderr || stdout || err.message).trim();
          return reject(err);
        }
        resolve(String(stdout || "").trim());
      });
    });
  }

  async function serviceStatus(service) {
    try {
      const output = await systemctl([
        "show", service.unit,
        "--property=ActiveState,SubState,MainPID,ActiveEnterTimestamp",
        "--no-pager"
      ], 8000);
      const values = Object.fromEntries(output.split("\n").map(line => {
        const pos = line.indexOf("=");
        return pos < 0 ? [line, ""] : [line.slice(0, pos), line.slice(pos + 1)];
      }));
      return { ...service, ...values, error: "" };
    } catch (err) {
      return { ...service, ActiveState: "unknown", SubState: "unknown", MainPID: "0", ActiveEnterTimestamp: "", error: err.output || err.message };
    }
  }

  async function performServiceAction(service, action, actor) {
    const operation = {
      key: `${service.key}-${Date.now()}`,
      service: service.key,
      label: service.label,
      action,
      actor,
      state: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      message: `${action === "restart" ? "Restarting" : "Starting"} ${service.label}`
    };
    serviceOperations.set(service.key, operation);
    try {
      await systemctl([action, service.unit], 90000);
      operation.state = "complete";
      operation.message = `${service.label} ${action} completed.`;
    } catch (err) {
      operation.state = "failed";
      operation.message = err.output || err.message;
    } finally {
      operation.finishedAt = new Date().toISOString();
    }
    return operation;
  }

  app.get("/admin/admin.css", requireGM, (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.sendFile(path.join(__dirname, "admin.css"));
  });

  app.get("/admin", requireGM, async (req, res) => {
    const realm = req.activeRealm;
    let accountCount = 0;
    let characterCount = 0;
    let onlineCount = 0;
    let shopCount = 0;
    let recentAudit = [];

    try {
      const auth = await authDb(realm);
      const chars = await characterDb(realm);
      const central = await centralDb();
      const [[accounts]] = await auth.execute("SELECT COUNT(*) AS total FROM account");
      const [[characters]] = await chars.execute("SELECT COUNT(*) AS total FROM characters WHERE deleteDate IS NULL OR deleteDate = 0");
      const [[online]] = await chars.execute("SELECT COUNT(*) AS total FROM characters WHERE online = 1 AND (deleteDate IS NULL OR deleteDate = 0)");
      const [[catalog]] = await central.execute(`SELECT COUNT(*) AS total FROM shop_catalog_items WHERE active = 1 AND realm_key IN ('all', ?)`, [realm.key]);
      const [events] = await central.execute(`
        SELECT actor_username, action, target_type, target_key, created_at
        FROM admin_audit_events ORDER BY id DESC LIMIT 8
      `);
      accountCount = Number(accounts.total || 0);
      characterCount = Number(characters.total || 0);
      onlineCount = Number(online.total || 0);
      shopCount = Number(catalog.total || 0);
      recentAudit = events;
      await Promise.all([auth.end(), chars.end(), central.end()]);
    } catch (err) {
      console.error("control center overview failed", err.message);
    }

    const card = (icon, title, text, href, ownerOnly = false) => ownerOnly && !isAdminOwner(req) ? "" : `
      <a class="admin-hub-card" href="${href}">
        <span class="admin-hub-icon">${icon}</span>
        <div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>
        <span class="admin-hub-arrow">→</span>
      </a>`;

    const auditRows = recentAudit.map(row => `
      <tr><td>${esc(row.actor_username)}</td><td>${esc(row.action)}</td><td>${esc(row.target_type)}: ${esc(row.target_key)}</td><td>${esc(new Date(row.created_at).toLocaleString())}</td></tr>
    `).join("");

    render(req, res, "FrozenThrone Control Center", `
      <link rel="stylesheet" href="/admin/admin.css">
      <main class="container admin-os">
        <section class="admin-os-hero">
          <div><p class="eyebrow">FrozenThrone Admin OS</p><h1>Control Center</h1><p>Run ${esc(realm.name)}, manage content, control rewards, and operate the realm from one dashboard.</p></div>
          <div class="admin-owner-chip">${isAdminOwner(req) ? "Master Account" : "Game Master"}<strong>${esc(req.user.username)}</strong></div>
        </section>

        <section class="admin-stat-grid">
          <div><span>Active Realm</span><strong>${esc(realm.name)}</strong></div>
          <div><span>Accounts</span><strong>${esc(accountCount)}</strong></div>
          <div><span>Characters</span><strong>${esc(characterCount)}</strong></div>
          <div><span>Online</span><strong>${esc(onlineCount)}</strong></div>
          <div><span>Shop Rewards</span><strong>${esc(shopCount)}</strong></div>
        </section>

        <section class="admin-hub-section"><header><p class="eyebrow">Players & Economy</p><h2>Realm Administration</h2></header><div class="admin-hub-grid">
          ${card("👥", "Players & Accounts", "Search characters, inventory, accounts, gear, and online status.", "/admin/search")}
          ${card("📬", "Mail & Rewards", "Send mail, gold, items, and player rewards.", "/admin/mail")}
          ${card("🪙", "Reward Wallets", "Review balances and add or subtract Vote Tokens.", "/admin/votes", true)}
        </div></section>

        <section class="admin-hub-section"><header><p class="eyebrow">Content</p><h2>Website & Community</h2></header><div class="admin-hub-grid">
          ${card("📰", "News Manager", "Publish posts and create news categories.", "/admin/content")}
          ${card("💬", "Forum Manager", "Create categories and organize discussion boards.", "/admin/forums")}
          ${card("🛒", "Shop Catalog", "Add realm items, prices, quantities, and categories.", "/admin/shop")}
        </div></section>

        <section class="admin-hub-section"><header><p class="eyebrow">World Data & Operations</p><h2>Game Management</h2></header><div class="admin-hub-grid">
          ${card("🎒", "Items", "Inspect item templates, owners, vendors, and drops.", "/admin/items")}
          ${card("🧙", "NPCs & Vendors", "Inspect creatures, loot, spawns, and vendor inventory.", "/admin/npcs")}
          ${card("📜", "Quest Editor", "Inspect and safely alter quest templates.", "/admin/quests")}
          ${card("⚙️", "Server Operations", "Start or silently restart approved services.", "/admin/servers", true)}
          ${card("📋", "Audit History", "Review sensitive control-center activity.", "/admin/audit")}
        </div></section>

        <section class="admin-hub-section"><header><p class="eyebrow">Recent Activity</p><h2>Control Center Audit</h2></header>
          <div class="card table-wrap"><table class="data-table"><thead><tr><th>Admin</th><th>Action</th><th>Target</th><th>Date</th></tr></thead><tbody>${auditRows || `<tr><td colspan="4">No control-center actions yet.</td></tr>`}</tbody></table></div>
        </section>
      </main>`);
  });

  app.get("/admin/audit", requireGM, async (req, res) => {
    let conn;
    try {
      conn = await centralDb();
      const [rows] = await conn.execute(`
        SELECT id, actor_username, actor_realm_key, action, target_type, target_key, details_json, created_at
        FROM admin_audit_events ORDER BY id DESC LIMIT 250
      `);
      const body = rows.map(row => `<tr><td>#${esc(row.id)}</td><td>${esc(row.actor_username)}<br><small>${esc(row.actor_realm_key)}</small></td><td>${esc(row.action)}</td><td>${esc(row.target_type)}: ${esc(row.target_key)}</td><td><code>${esc(row.details_json || "{}")}</code></td><td>${esc(new Date(row.created_at).toLocaleString())}</td></tr>`).join("");
      render(req, res, "Admin Audit", `<link rel="stylesheet" href="/admin/admin.css"><main class="container admin-os"><section class="section-head"><p class="eyebrow">FrozenThrone Admin OS</p><h1>Audit History</h1><p>Permanent history for catalog, economy, category, and server-control actions.</p></section><div class="card table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th><th>Date</th></tr></thead><tbody>${body || `<tr><td colspan="6">No events yet.</td></tr>`}</tbody></table></div></main>`);
    } catch (err) {
      render(req, res, "Audit Error", `<main class="container"><div class="card"><h3>Audit Error</h3><p>${esc(err.message)}</p></div></main>`);
    } finally {
      if (conn) await conn.end();
    }
  });

  app.get("/admin/shop", requireGM, async (req, res) => {
    const realm = req.activeRealm;
    let conn;
    let world;
    try {
      conn = await centralDb();
      world = await worldDb(realm);
      const [categories] = await conn.execute(`SELECT * FROM shop_categories ORDER BY sort_order, id`);
      const [items] = await conn.execute(`
        SELECT item.*, category.name AS category_name
        FROM shop_catalog_items item
        JOIN shop_categories category ON category.id = item.category_id
        WHERE item.realm_key IN ('all', ?)
        ORDER BY category.sort_order, item.sort_order, item.id
      `, [realm.key]);

      const q = String(req.query.q || "").trim();
      let matches = [];
      if (q) {
        const entry = /^\d+$/.test(q) ? Number(q) : 0;
        [matches] = await world.execute(`
          SELECT entry, name, displayid, Quality, stackable
          FROM item_template
          WHERE (? > 0 AND entry = ?) OR name LIKE ?
          ORDER BY CASE WHEN entry = ? THEN 0 ELSE 1 END, name
          LIMIT 30
        `, [entry, entry, `%${q}%`, entry]);
      }

      const options = categories.filter(category => category.active).map(category => `<option value="${esc(category.id)}">${esc(category.name)}</option>`).join("");
      const categoryRows = categories.map(category => `
        <form class="admin-inline-edit" method="POST" action="/admin/shop/category/${category.id}">
          ${csrfField(req)}<input name="name" value="${esc(category.name)}" required><input name="sort_order" type="number" value="${esc(category.sort_order)}"><label><input type="checkbox" name="active" value="1" ${category.active ? "checked" : ""}> Active</label><button class="btn secondary" type="submit">Save</button>
        </form>`).join("");
      const itemRows = items.map(item => `<tr><td>${esc(item.id)}</td><td><strong>${esc(item.name_override || item.sku)}</strong><br><small>${esc(item.sku)}</small></td><td>${esc(item.item_entry)}</td><td>${esc(item.category_name)}</td><td>${esc(item.quantity)}</td><td>${esc(item.token_cost)}</td><td>${esc(item.realm_key)}</td><td>${item.active ? "Active" : "Hidden"}</td><td><a class="btn secondary" href="/admin/shop/item/${item.id}">Edit</a></td></tr>`).join("");
      const matchRows = matches.map(item => `<tr><td>${esc(item.entry)}</td><td>${esc(item.name)}</td><td>${esc(item.stackable)}</td><td><a class="btn secondary" href="/admin/shop?entry=${esc(item.entry)}#add-shop-item">Use Item</a></td></tr>`).join("");
      const selectedEntry = Number(req.query.entry || 0);
      let selected = null;
      if (selectedEntry > 0) [[selected]] = await world.execute(`SELECT entry, name, displayid, stackable FROM item_template WHERE entry = ? LIMIT 1`, [selectedEntry]);

      render(req, res, `${realm.name} Shop Manager`, `
        <link rel="stylesheet" href="/admin/admin.css"><main class="container admin-os">
          <section class="section-head"><p class="eyebrow">${esc(realm.name)} Catalog</p><h1>Shop Manager</h1><p>Add real realm items, organize categories, and set Vote Token prices without editing source files.</p></section>
          <div class="admin-two-column">
            <section class="card"><h2>Categories</h2><div class="admin-edit-stack">${categoryRows}</div><hr><form method="POST" action="/admin/shop/category"><h3>New Category</h3>${csrfField(req)}<label>Name</label><input name="name" required placeholder="Enchanting Materials"><label>Sort Order</label><input name="sort_order" type="number" value="99"><button class="btn" type="submit">Create Category</button></form></section>
            <section class="card"><h2>Find Realm Item</h2><form method="GET" action="/admin/shop"><label>Item ID or Name</label><div class="admin-search-row"><input name="q" value="${esc(q)}" placeholder="33447 or Runic Mana Potion"><button class="btn" type="submit">Search</button></div></form>${q ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Entry</th><th>Name</th><th>Stack</th><th></th></tr></thead><tbody>${matchRows || `<tr><td colspan="4">No matching items.</td></tr>`}</tbody></table></div>` : ""}</section>
          </div>
          <section class="card" id="add-shop-item"><h2>Add Shop Reward</h2>${selected ? `<div class="admin-selected-item"><img src="${esc(itemIconUrl(selected.displayid))}" alt=""><div><strong>${esc(selected.name)}</strong><span>Entry ${esc(selected.entry)} · Maximum stack ${esc(selected.stackable)}</span></div></div>` : `<p class="muted">Search above and choose an item, or enter a valid item ID.</p>`}<form method="POST" action="/admin/shop/item"><div class="admin-form-grid">${csrfField(req)}<label>Item Entry<input name="item_entry" type="number" value="${esc(selected?.entry || "")}" required></label><label>Display Name<input name="name_override" value="${esc(selected?.name || "")}" placeholder="Uses database name when empty"></label><label>Category<select name="category_id" required>${options}</select></label><label>Realm Scope<select name="realm_key"><option value="${esc(realm.key)}">${esc(realm.name)} only</option><option value="all">Both public realms</option></select></label><label>Quantity<input name="quantity" type="number" min="1" value="1" required></label><label>Vote Token Cost<input name="token_cost" type="number" min="0" value="1" required></label><label>Sort Order<input name="sort_order" type="number" value="99"></label><label class="admin-check"><input type="checkbox" name="active" value="1" checked> Active</label></div><label>Description</label><input name="description" placeholder="Delivered instantly through in-game mail."><button class="btn" type="submit">Add Reward</button></form></section>
          <section class="card"><h2>Current ${esc(realm.name)} Catalog</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Reward</th><th>Entry</th><th>Category</th><th>Qty</th><th>Tokens</th><th>Scope</th><th>Status</th><th></th></tr></thead><tbody>${itemRows || `<tr><td colspan="9">No catalog items.</td></tr>`}</tbody></table></div></section>
        </main>`);
    } catch (err) {
      console.error("shop admin failed", err);
      render(req, res, "Shop Manager Error", `<main class="container"><div class="card"><h3>Shop Manager Error</h3><p>${esc(err.message)}</p></div></main>`);
    } finally {
      if (world) await world.end();
      if (conn) await conn.end();
    }
  });

  app.post("/admin/shop/category", requireGM, requireAdminCsrf, async (req, res) => {
    let conn;
    try {
      const name = String(req.body.name || "").trim();
      if (!name) throw new Error("Category name is required.");
      const slug = name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      conn = await centralDb();
      const [result] = await conn.execute(`INSERT INTO shop_categories (slug, name, sort_order, active) VALUES (?, ?, ?, 1)`, [slug, name, Number(req.body.sort_order || 99)]);
      await audit(req, "shop.category.create", "shop_category", result.insertId, { name, slug });
      res.redirect("/admin/shop");
    } catch (err) {
      res.status(400).send(esc(err.message));
    } finally { if (conn) await conn.end(); }
  });

  app.post("/admin/shop/category/:id", requireGM, requireAdminCsrf, async (req, res) => {
    let conn;
    try {
      const id = Number(req.params.id);
      const name = String(req.body.name || "").trim();
      if (!Number.isSafeInteger(id) || id < 1 || !name) throw new Error("Invalid category.");
      conn = await centralDb();
      await conn.execute(`UPDATE shop_categories SET name = ?, sort_order = ?, active = ? WHERE id = ?`, [name, Number(req.body.sort_order || 0), req.body.active === "1" ? 1 : 0, id]);
      await audit(req, "shop.category.update", "shop_category", id, { name, active: req.body.active === "1" });
      res.redirect("/admin/shop");
    } catch (err) { res.status(400).send(esc(err.message)); }
    finally { if (conn) await conn.end(); }
  });

  app.post("/admin/shop/item", requireGM, requireAdminCsrf, async (req, res) => {
    let conn;
    let world;
    try {
      const realm = req.activeRealm;
      const entry = Number(req.body.item_entry);
      const quantity = Number(req.body.quantity);
      const tokenCost = Number(req.body.token_cost);
      const categoryId = Number(req.body.category_id);
      const realmKey = req.body.realm_key === "all" ? "all" : realm.key;
      if (![entry, quantity, tokenCost, categoryId].every(Number.isSafeInteger) || entry < 1 || quantity < 1 || tokenCost < 0 || categoryId < 1) throw new Error("Invalid shop item values.");
      world = await worldDb(realm);
      const [[item]] = await world.execute(`SELECT entry, name, stackable FROM item_template WHERE entry = ? LIMIT 1`, [entry]);
      if (!item) throw new Error("That item does not exist on the selected realm.");
      if (quantity > Math.max(1, Number(item.stackable || 1))) throw new Error(`Quantity cannot exceed the item stack size of ${item.stackable}.`);
      const skuBase = `${realmKey}-${entry}-${Date.now().toString(36)}`.toLowerCase();
      conn = await centralDb();
      const [result] = await conn.execute(`
        INSERT INTO shop_catalog_items
          (sku, item_entry, name_override, description, quantity, token_cost, category_id, realm_key, active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [skuBase, entry, String(req.body.name_override || item.name).trim(), String(req.body.description || "").trim(), quantity, tokenCost, categoryId, realmKey, req.body.active === "1" ? 1 : 0, Number(req.body.sort_order || 99)]);
      await audit(req, "shop.item.create", "shop_item", result.insertId, { sku: skuBase, entry, quantity, tokenCost, realmKey });
      res.redirect("/admin/shop");
    } catch (err) { res.status(400).send(esc(err.message)); }
    finally { if (world) await world.end(); if (conn) await conn.end(); }
  });

  app.get("/admin/shop/item/:id", requireGM, async (req, res) => {
    let conn;
    try {
      conn = await centralDb();
      const [[item]] = await conn.execute(`SELECT * FROM shop_catalog_items WHERE id = ?`, [Number(req.params.id)]);
      const [categories] = await conn.execute(`SELECT id, name FROM shop_categories ORDER BY sort_order, id`);
      if (!item) return res.status(404).send("Shop item not found.");
      const options = categories.map(category => `<option value="${esc(category.id)}" ${Number(category.id) === Number(item.category_id) ? "selected" : ""}>${esc(category.name)}</option>`).join("");
      render(req, res, "Edit Shop Reward", `<link rel="stylesheet" href="/admin/admin.css"><main class="container admin-os"><section class="section-head"><p class="eyebrow">Shop Catalog</p><h1>Edit Reward</h1><p>${esc(item.sku)}</p></section><section class="card"><form method="POST" action="/admin/shop/item/${item.id}">${csrfField(req)}<div class="admin-form-grid"><label>Item Entry<input name="item_entry" type="number" value="${esc(item.item_entry)}" required></label><label>Display Name<input name="name_override" value="${esc(item.name_override || "")}"></label><label>Category<select name="category_id">${options}</select></label><label>Realm Scope<select name="realm_key"><option value="all" ${item.realm_key === "all" ? "selected" : ""}>Both public realms</option><option value="main" ${item.realm_key === "main" ? "selected" : ""}>FrozenThrone</option><option value="shadowmourne" ${item.realm_key === "shadowmourne" ? "selected" : ""}>Shadowmourne</option></select></label><label>Quantity<input name="quantity" type="number" min="1" value="${esc(item.quantity)}"></label><label>Vote Token Cost<input name="token_cost" type="number" min="0" value="${esc(item.token_cost)}"></label><label>Sort Order<input name="sort_order" type="number" value="${esc(item.sort_order)}"></label><label class="admin-check"><input type="checkbox" name="active" value="1" ${item.active ? "checked" : ""}> Active</label></div><label>Description</label><input name="description" value="${esc(item.description || "")}"><button class="btn" type="submit">Save Reward</button><a class="btn secondary" href="/admin/shop">Cancel</a></form></section></main>`);
    } catch (err) { res.status(400).send(esc(err.message)); }
    finally { if (conn) await conn.end(); }
  });

  app.post("/admin/shop/item/:id", requireGM, requireAdminCsrf, async (req, res) => {
    let conn;
    let world;
    try {
      const id = Number(req.params.id);
      const entry = Number(req.body.item_entry);
      const quantity = Number(req.body.quantity);
      const tokenCost = Number(req.body.token_cost);
      const categoryId = Number(req.body.category_id);
      if (![id, entry, quantity, tokenCost, categoryId].every(Number.isSafeInteger) || id < 1 || entry < 1 || quantity < 1 || tokenCost < 0 || categoryId < 1) throw new Error("Invalid shop item values.");
      world = await worldDb(req.activeRealm);
      const [[realmItem]] = await world.execute(`SELECT entry, stackable FROM item_template WHERE entry = ? LIMIT 1`, [entry]);
      if (!realmItem) throw new Error("That item does not exist on the selected realm.");
      if (quantity > Math.max(1, Number(realmItem.stackable || 1))) throw new Error(`Quantity cannot exceed the item stack size of ${realmItem.stackable}.`);
      conn = await centralDb();
      await conn.execute(`UPDATE shop_catalog_items SET item_entry = ?, name_override = ?, description = ?, quantity = ?, token_cost = ?, category_id = ?, realm_key = ?, active = ?, sort_order = ? WHERE id = ?`, [entry, String(req.body.name_override || "").trim(), String(req.body.description || "").trim(), quantity, tokenCost, categoryId, ["all", "main", "shadowmourne"].includes(req.body.realm_key) ? req.body.realm_key : req.activeRealm.key, req.body.active === "1" ? 1 : 0, Number(req.body.sort_order || 0), id]);
      await audit(req, "shop.item.update", "shop_item", id, { entry, quantity, tokenCost, active: req.body.active === "1" });
      res.redirect("/admin/shop");
    } catch (err) { res.status(400).send(esc(err.message)); }
    finally { if (world) await world.end(); if (conn) await conn.end(); }
  });

  app.get("/admin/servers", requireOwner, async (req, res) => {
    const statuses = await Promise.all(SERVICE_DEFINITIONS.map(serviceStatus));
    const rows = statuses.map(service => {
      const operation = serviceOperations.get(service.key);
      const active = service.ActiveState === "active";
      return `<article class="admin-service-card ${active ? "is-online" : "is-offline"}"><header><div><p>${esc(service.realm)}</p><h3>${esc(service.label)}</h3><small>${esc(service.unit)}</small></div><span class="admin-service-state">${active ? "Online" : esc(service.ActiveState)}</span></header><dl><div><dt>State</dt><dd>${esc(service.ActiveState)} / ${esc(service.SubState)}</dd></div><div><dt>PID</dt><dd>${esc(service.MainPID || "0")}</dd></div><div><dt>Active Since</dt><dd>${esc(service.ActiveEnterTimestamp || "Unknown")}</dd></div></dl>${operation ? `<p class="admin-operation ${esc(operation.state)}">${esc(operation.message)}</p>` : ""}<div class="admin-actions"><form method="POST" action="/admin/servers/${esc(service.key)}/start" onsubmit="return confirm('Start ${esc(service.label)}?');">${csrfField(req)}<button class="btn secondary" type="submit">Start</button></form><form method="POST" action="/admin/servers/${esc(service.key)}/restart" onsubmit="return confirm('Silently restart ${esc(service.label)} now? Players will be disconnected without an in-game countdown.');">${csrfField(req)}<button class="btn ${service.group === "website" ? "secondary" : ""}" type="submit">Silent Restart</button></form></div></article>`;
    }).join("");
    render(req, res, "Server Operations", `<link rel="stylesheet" href="/admin/admin.css"><main class="container admin-os"><section class="admin-os-hero"><div><p class="eyebrow">Master Account Only</p><h1>Server Operations</h1><p>Start or silently restart only the approved FrozenThrone services. Every action is audited.</p></div><div class="admin-danger-chip">LIVE CONTROLS<strong>${esc(req.user.username)}</strong></div></section><section class="card admin-warning"><strong>Silent restart means no in-game countdown.</strong><p>Online players may be disconnected immediately. The website is kept separate from Restart All so progress remains visible.</p></section><section class="admin-service-grid">${rows}</section><section class="card admin-restart-all"><div><p class="eyebrow">All Game Services</p><h2>Restart FrozenThrone, Shadowmourne, and Solo Beta</h2><p>Restarts five approved auth/world services sequentially. The website and scheduled-events helper are excluded.</p></div><form method="POST" action="/admin/servers/restart-all" onsubmit="return confirm('Restart ALL FrozenThrone game and authentication services without an in-game countdown?');">${csrfField(req)}<button class="btn danger" type="submit">Silent Restart All Game Servers</button></form></section></main>`);
  });

  app.post("/admin/servers/restart-all", requireOwner, requireAdminCsrf, async (req, res) => {
    const services = SERVICE_DEFINITIONS.filter(service => service.group === "game");
    await audit(req, "server.restart_all.requested", "service_group", "game", { services: services.map(service => service.unit) });
    const actor = req.user.username;
    const auditRequest = { user: { id: req.user.id, username: req.user.username, realmKey: req.user.realmKey } };
    res.redirect("/admin/servers");
    setImmediate(async () => {
      for (const service of services) {
        const result = await performServiceAction(service, "restart", actor);
        await audit(auditRequest, `server.restart.${result.state}`, "service", service.unit, { message: result.message });
      }
    });
  });

  app.post("/admin/servers/:service/:action", requireOwner, requireAdminCsrf, async (req, res) => {
    const service = SERVICE_DEFINITIONS.find(candidate => candidate.key === req.params.service);
    const action = String(req.params.action);
    if (!service || !["start", "restart"].includes(action)) return res.status(400).send("Unsupported service action.");
    await audit(req, `server.${action}.requested`, "service", service.unit, {});
    const actor = req.user.username;
    const auditRequest = { user: { id: req.user.id, username: req.user.username, realmKey: req.user.realmKey } };

    if (service.group === "website" && action === "restart") {
      await audit(req, "server.restart.dispatched", "service", service.unit, { noBlock: true });
      res.redirect("/admin/servers");
      setTimeout(() => {
        execFile("/bin/systemctl", ["--no-block", "restart", service.unit], err => {
          if (err) console.error("website restart dispatch failed", err.message);
        });
      }, 500);
      return;
    }

    res.redirect("/admin/servers");
    setImmediate(async () => {
      const result = await performServiceAction(service, action, actor);
      await audit(auditRequest, `server.${action}.${result.state}`, "service", service.unit, { message: result.message });
    });
  });
};
