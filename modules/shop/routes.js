const crypto = require("crypto");
const { SHOP_ITEMS, SHOP_CATEGORIES, getShopItem } = require("./catalog");

module.exports = function registerShopRoutes(app, tools) {
  const {
    render,
    esc,
    mysql,
    dbConfig,
    requireLogin,
    itemIconUrl
  } = tools;

  function safeIdentifier(value) {
    const identifier = String(value || "");
    if (!/^[A-Za-z0-9_]+$/.test(identifier)) throw new Error("Invalid database identifier");
    return `\`${identifier}\``;
  }

  function purchaseMessage(code) {
    return ({
      insufficient: "You do not have enough Vote Tokens for that reward.",
      character: "That character was not found on your selected realm.",
      item: "That reward is not available on the selected realm.",
      invalid: "That purchase request was invalid.",
      unavailable: "The shop is not ready yet. Run the vote/shop database migration first.",
      failed: "The purchase could not be completed. No tokens were taken."
    })[code] || "";
  }

  function characterOptions(characters) {
    return characters.map(character => `
      <option value="${esc(character.guid)}">${esc(character.name)} · Level ${esc(character.level)}</option>
    `).join("");
  }

  function itemQuantity(item) {
    const quantity = Number(item?.quantity || 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) {
      throw new Error(`Invalid shop quantity for ${item?.sku || "unknown item"}`);
    }
    return quantity;
  }

  function categorySlug(value) {
    return String(value || "category")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function shopCard(item, realmItem, characters, tokens) {
    const quantity = itemQuantity(item);
    const maxStack = Math.max(1, Number(realmItem?.stackable || 1));
    const available = Boolean(realmItem) && maxStack >= quantity && characters.length > 0;
    const canAfford = Number(tokens) >= item.tokenCost;
    const nonce = crypto.randomBytes(32).toString("hex");
    const iconUrl = realmItem ? itemIconUrl(realmItem.displayid) : "";

    return `
      <article class="card shop-card ${available ? "" : "shop-card-unavailable"}">
        <div class="shop-item-art">
          ${iconUrl ? `<img src="${esc(iconUrl)}" alt="">` : `<span>${esc(item.icon)}</span>`}
        </div>
        <p class="eyebrow">${esc(item.category)}</p>
        <h3>${esc(realmItem?.name || item.name)}</h3>
        <span class="shop-quantity">Quantity: ${esc(quantity)}</span>
        <p class="muted">${esc(item.description)}</p>
        <p class="shop-price">${esc(item.tokenCost)} Vote Token${item.tokenCost === 1 ? "" : "s"}</p>
        <form method="POST" action="/shop/purchase" onsubmit="return confirm('Spend these Vote Tokens and mail this reward?')">
          <input type="hidden" name="sku" value="${esc(item.sku)}">
          <input type="hidden" name="purchaseKey" value="${nonce}">
          <label>Deliver to</label>
          <select name="characterGuid" ${available ? "required" : "disabled"}>
            ${characters.length ? characterOptions(characters) : `<option>No characters on this realm</option>`}
          </select>
          <button class="btn ${canAfford ? "gold" : "secondary"}" type="submit" ${available && canAfford ? "" : "disabled"}>
            ${available ? (canAfford ? "Buy & Mail Item" : "Not Enough Tokens") : "Unavailable"}
          </button>
        </form>
      </article>
    `;
  }

  app.get(["/shop", "/shop.html"], requireLogin, async (req, res) => {
    const realm = req.activeRealm;
    const conn = await mysql.createConnection({ ...dbConfig, database: "frozenthrone" });

    try {
      const [[wallet]] = await conn.execute(`
        SELECT vote_tokens, pending_gold
        FROM frozenthrone.vote_accounts
        WHERE realm_key = ? AND account_id = ?
      `, [realm.key, req.user.id]);

      const charactersDb = safeIdentifier(realm.characters_db);
      const worldDb = safeIdentifier(realm.world_db);

      const [characters] = await conn.execute(`
        SELECT guid, name, level, class
        FROM ${charactersDb}.characters
        WHERE account = ?
          AND (deleteDate IS NULL OR deleteDate = 0)
        ORDER BY level DESC, name ASC
      `, [req.user.id]);

      const entries = SHOP_ITEMS.map(item => item.entry);
      const placeholders = entries.map(() => "?").join(",");
      const [realmItems] = await conn.execute(`
        SELECT entry, name, displayid, Quality, stackable
        FROM ${worldDb}.item_template
        WHERE entry IN (${placeholders})
      `, entries);
      const itemMap = new Map(realmItems.map(item => [Number(item.entry), item]));

      const [history] = await conn.execute(`
        SELECT id, character_name, item_name, quantity, token_cost, created_at
        FROM frozenthrone.shop_purchases
        WHERE realm_key = ? AND account_id = ?
        ORDER BY id DESC
        LIMIT 10
      `, [realm.key, req.user.id]);

      const tokens = Number(wallet?.vote_tokens || 0);
      const pendingGold = Number(wallet?.pending_gold || 0);
      const boughtId = String(req.query.purchase || "").replace(/[^0-9]/g, "");
      const error = purchaseMessage(String(req.query.error || ""));

      const historyRows = history.map(row => `
        <tr>
          <td>#${esc(row.id)}</td>
          <td>${esc(row.item_name)} <span class="shop-history-quantity">×${esc(row.quantity || 1)}</span></td>
          <td>${esc(row.character_name)}</td>
          <td>${esc(row.token_cost)}</td>
          <td>${esc(new Date(row.created_at).toLocaleString())}</td>
        </tr>
      `).join("");

      render(req, res, `${realm.name} Marketplace`, `
        <main class="container">
          <section class="section-head">
            <p class="eyebrow">${esc(realm.name)} Marketplace</p>
            <h1>❄️ Vote Token Shop</h1>
            <p>Choose one of your ${esc(realm.name)} characters. Purchased rewards are delivered immediately through in-game mail—even while the character is offline.</p>
          </section>

          ${boughtId ? `<div class="card highlight shop-notice"><h3>✅ Purchase Complete</h3><p>Purchase #${esc(boughtId)} was mailed successfully. Open that character's mailbox in game.</p></div>` : ""}
          ${error ? `<div class="card shop-error"><h3>Purchase Not Completed</h3><p>${esc(error)}</p></div>` : ""}

          <div class="grid grid-3">
            <div class="card stat"><span>Selected Realm</span><strong>${esc(realm.name)}</strong></div>
            <div class="card stat"><span>Vote Tokens</span><strong>${esc(tokens)}</strong></div>
            <div class="card stat"><span>Pending Vote Gold</span><strong>${esc(pendingGold)}g</strong></div>
          </div>

          <section class="shop-category-nav-wrap">
            <header>
              <p class="eyebrow">Browse the Marketplace</p>
              <h2>Shop Categories</h2>
            </header>
            <nav class="shop-category-nav" aria-label="Shop categories">
              ${SHOP_CATEGORIES.map(category => {
                const total = SHOP_ITEMS.filter(item => item.category === category).length;
                return `<a href="#shop-${esc(categorySlug(category))}"><strong>${esc(category)}</strong><span>${esc(total)} item${total === 1 ? "" : "s"}</span></a>`;
              }).join("")}
            </nav>
          </section>

          <div class="shop-catalog">
            ${SHOP_CATEGORIES.map(category => {
              const items = SHOP_ITEMS.filter(item => item.category === category);
              if (!items.length) return "";
              return `
                <section class="shop-category-section category-${esc(categorySlug(category))}" id="shop-${esc(categorySlug(category))}">
                  <header class="shop-category-head">
                    <p class="eyebrow">FrozenThrone Supplies</p>
                    <h2>${esc(category)}</h2>
                    <span>${esc(items.length)} reward${items.length === 1 ? "" : "s"}</span>
                  </header>
                  <div class="grid grid-2 shop-grid">
                    ${items.map(item => shopCard(item, itemMap.get(item.entry), characters, tokens)).join("")}
                  </div>
                </section>
              `;
            }).join("")}
          </div>

          <section class="card">
            <h2>Recent Purchases</h2>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>Reward</th><th>Character</th><th>Tokens</th><th>Date</th></tr></thead>
                <tbody>${historyRows || `<tr><td colspan="5">No purchases on this realm yet.</td></tr>`}</tbody>
              </table>
            </div>
          </section>
        </main>
      `);
    } catch (err) {
      console.error("shop page failed", err);
      render(req, res, "Shop Error", `<main class="container"><div class="card"><h3>Shop Error</h3><p>${esc(purchaseMessage(err.code === "ER_NO_SUCH_TABLE" || err.code === "ER_BAD_FIELD_ERROR" ? "unavailable" : "failed"))}</p></div></main>`);
    } finally {
      await conn.end();
    }
  });

  app.post("/shop/purchase", requireLogin, async (req, res) => {
    const realm = req.activeRealm;
    const item = getShopItem(req.body.sku);
    const characterGuid = Number(req.body.characterGuid);
    const purchaseKey = String(req.body.purchaseKey || "");

    if (!item || !Number.isSafeInteger(characterGuid) || characterGuid < 1 || !/^[a-f0-9]{64}$/.test(purchaseKey)) {
      return res.redirect("/shop?error=invalid");
    }

    const conn = await mysql.createConnection({ ...dbConfig, database: "frozenthrone" });
    let namedLock = false;

    try {
      await conn.beginTransaction();

      await conn.execute(`
        INSERT IGNORE INTO frozenthrone.vote_accounts
          (account_id, realm_key, lifetime_votes, vote_tokens, pending_gold, current_streak, last_vote_at)
        VALUES (?, ?, 0, 0, 0, 0, NULL)
      `, [req.user.id, realm.key]);

      const [[wallet]] = await conn.execute(`
        SELECT vote_tokens
        FROM frozenthrone.vote_accounts
        WHERE realm_key = ? AND account_id = ?
        FOR UPDATE
      `, [realm.key, req.user.id]);

      const [[duplicate]] = await conn.execute(`
        SELECT id, realm_key, account_id
        FROM frozenthrone.shop_purchases
        WHERE idempotency_key = ?
        LIMIT 1
      `, [purchaseKey]);

      if (duplicate) {
        if (duplicate.realm_key !== realm.key || Number(duplicate.account_id) !== Number(req.user.id)) {
          await conn.rollback();
          return res.redirect("/shop?error=invalid");
        }
        await conn.commit();
        return res.redirect(`/shop?purchase=${encodeURIComponent(duplicate.id)}`);
      }

      if (Number(wallet.vote_tokens) < item.tokenCost) {
        await conn.rollback();
        return res.redirect("/shop?error=insufficient");
      }

      const charactersDb = safeIdentifier(realm.characters_db);
      const worldDb = safeIdentifier(realm.world_db);

      const [[character]] = await conn.execute(`
        SELECT guid, name, account
        FROM ${charactersDb}.characters
        WHERE guid = ? AND account = ?
          AND (deleteDate IS NULL OR deleteDate = 0)
        LIMIT 1
        FOR UPDATE
      `, [characterGuid, req.user.id]);

      if (!character) {
        await conn.rollback();
        return res.redirect("/shop?error=character");
      }

      const [[realmItem]] = await conn.execute(`
        SELECT entry, name, displayid, Quality, stackable
        FROM ${worldDb}.item_template
        WHERE entry = ?
        LIMIT 1
      `, [item.entry]);

      if (!realmItem) {
        await conn.rollback();
        return res.redirect("/shop?error=item");
      }

      const quantity = itemQuantity(item);
      const maxStack = Math.max(1, Number(realmItem.stackable || 1));
      if (quantity > maxStack) {
        await conn.rollback();
        return res.redirect("/shop?error=item");
      }

      const lockName = `frozenthrone_shop_${realm.key}`;
      const [[lockResult]] = await conn.execute("SELECT GET_LOCK(?, 10) AS acquired", [lockName]);
      namedLock = Number(lockResult.acquired) === 1;
      if (!namedLock) throw new Error("Could not acquire shop delivery lock");

      const [[itemMax]] = await conn.execute(`
        SELECT COALESCE(MAX(guid), 0) + 1 AS nextGuid
        FROM ${charactersDb}.item_instance
      `);
      const itemGuid = Number(itemMax.nextGuid);

      const [[mailMax]] = await conn.execute(`
        SELECT COALESCE(MAX(id), 0) + 1 AS nextId
        FROM ${charactersDb}.mail
      `);
      const mailId = Number(mailMax.nextId);
      const now = Math.floor(Date.now() / 1000);
      const expire = now + (30 * 24 * 60 * 60);

      await conn.execute(`
        INSERT INTO ${charactersDb}.item_instance
          (guid, itemEntry, owner_guid, creatorGuid, giftCreatorGuid, count, duration, charges, flags, enchantments, randomPropertyId, durability, playedTime, text)
        VALUES (?, ?, ?, 0, 0, ?, 0, '', 0, '', 0, 0, 0, NULL)
      `, [itemGuid, item.entry, character.guid, quantity]);

      await conn.execute(`
        INSERT INTO ${charactersDb}.mail
          (id, messageType, stationery, mailTemplateId, sender, receiver, subject, body, has_items, expire_time, deliver_time, money, cod, checked)
        VALUES (?, 0, 41, 0, 0, ?, ?, ?, 1, ?, ?, 0, 0, 0)
      `, [
        mailId,
        character.guid,
        "FrozenThrone Shop Purchase",
        `Thank you for supporting ${realm.name}! Your ${realmItem.name} ×${quantity} is attached.`,
        expire,
        now
      ]);

      await conn.execute(`
        INSERT INTO ${charactersDb}.mail_items (mail_id, item_guid, receiver)
        VALUES (?, ?, ?)
      `, [mailId, itemGuid, character.guid]);

      const [deduction] = await conn.execute(`
        UPDATE frozenthrone.vote_accounts
        SET vote_tokens = vote_tokens - ?
        WHERE realm_key = ? AND account_id = ? AND vote_tokens >= ?
      `, [item.tokenCost, realm.key, req.user.id, item.tokenCost]);

      if (deduction.affectedRows !== 1) throw new Error("Vote Token deduction failed");

      const [purchase] = await conn.execute(`
        INSERT INTO frozenthrone.shop_purchases
          (idempotency_key, realm_key, account_id, username, character_guid, character_name,
           sku, item_entry, item_name, quantity, token_cost, mail_id, item_guid, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered')
      `, [
        purchaseKey,
        realm.key,
        req.user.id,
        req.user.username,
        character.guid,
        character.name,
        item.sku,
        item.entry,
        realmItem.name,
        quantity,
        item.tokenCost,
        mailId,
        itemGuid
      ]);

      await conn.commit();
      namedLock = false;
      try { await conn.execute("SELECT RELEASE_LOCK(?)", [lockName]); } catch {}

      return res.redirect(`/shop?purchase=${encodeURIComponent(purchase.insertId)}`);
    } catch (err) {
      try { await conn.rollback(); } catch {}
      if (namedLock) {
        try { await conn.execute("SELECT RELEASE_LOCK(?)", [`frozenthrone_shop_${realm.key}`]); } catch {}
      }
      console.error("shop purchase failed", err);
      const unavailable = err.code === "ER_NO_SUCH_TABLE" || err.code === "ER_BAD_FIELD_ERROR";
      return res.redirect(`/shop?error=${unavailable ? "unavailable" : "failed"}`);
    } finally {
      await conn.end();
    }
  });
};
