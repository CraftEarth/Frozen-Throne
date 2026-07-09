module.exports = function registerShopRoutes(app, tools) {
  const { render, esc, mysql, dbConfig, requireLogin } = tools;

  async function ftDb() {
    return mysql.createPool({
      ...dbConfig,
      database: "frozenthrone",
      waitForConnections: true,
      connectionLimit: 10
    });
  }

  app.get("/shop", requireLogin, async (req, res) => {
    const conn = await ftDb();
    const [[wallet]] = await conn.execute(`
      SELECT vote_tokens
      FROM vote_accounts
      WHERE account_id = ?
    `, [req.user.id]);
    await conn.end();

    const tokens = wallet?.vote_tokens || 0;

    render(req, res, "FrozenThrone Marketplace", `
      <main class="container">
        <section class="section-head">
          <p class="eyebrow">FrozenThrone Marketplace</p>
          <h1>❄️ Marketplace</h1>
          <p>Spend your earned rewards on mounts, pets, cosmetics, services, and future FrozenThrone exclusives.</p>
        </section>

        <div class="grid grid-3">
          <div class="card stat"><span>Vote Tokens</span><strong>${esc(tokens)}</strong></div>
          <div class="card stat"><span>Frozen Crystals</span><strong>Coming Soon</strong></div>
          <div class="card stat"><span>Pending Rewards</span><strong>Coming Soon</strong></div>
        </div>

        <section class="card shop-hero">
          <p class="eyebrow">Featured Reward</p>
          <h2>🐉 Invincible</h2>
          <p>The legendary mount of the Lich King. A future premium reward for loyal FrozenThrone supporters.</p>
          <strong>250 Vote Tokens</strong>
          <br><br>
          <button class="btn gold disabled" disabled>Coming Soon</button>
        </section>

        <div class="ft-section-tabs">
          <a class="active">Featured</a>
          <a>Mounts</a>
          <a>Pets</a>
          <a>Services</a>
          <a>Bundles</a>
        </div>

        <section class="grid grid-3 shop-grid">
          ${shopCard("🐉", "Invincible", "Legendary mount reward.", "250 Vote Tokens")}
          ${shopCard("🐺", "Swift Spectral Wolf", "A rare spectral mount for dedicated players.", "150 Vote Tokens")}
          ${shopCard("🐾", "Lil' KT", "A sinister little companion pet.", "40 Vote Tokens")}
          ${shopCard("🎭", "Appearance Change", "Refresh your character look.", "25 Vote Tokens")}
          ${shopCard("🏳️", "Faction Change", "Change sides when available.", "75 Vote Tokens")}
          ${shopCard("📦", "Starter Bundle", "Bags, gold, and useful early-game rewards.", "50 Vote Tokens")}
        </section>
      </main>
    `);
  });

  function shopCard(icon, name, desc, price) {
    return `
      <article class="card shop-card">
        <div class="shop-icon">${icon}</div>
        <h3>${esc(name)}</h3>
        <p class="muted">${esc(desc)}</p>
        <strong>${esc(price)}</strong>
        <br><br>
        <button class="btn secondary disabled" disabled>Coming Soon</button>
      </article>
    `;
  }
};
