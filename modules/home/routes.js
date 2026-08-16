const path = require("path");
const { readPosts } = require("../news/engine");

module.exports = function registerHomeRoutes(app, tools) {
  const { render, esc, mysql, dbConfig, authDb } = tools;

  function niceDate(value, includeYear = false) {
    if (!value) return "Recently";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(includeYear ? { year: "numeric" } : {})
    });
  }

  function imageOf(post) {
    return post.heroImage || post.image || "/images/news.png";
  }

  function realmScopeOf(post) {
    const explicit = String(post.realmKey || post.realm || "").trim().toLowerCase();
    if (["main", "frozenthrone", "frostborne"].includes(explicit)) return "main";
    if (["shadowmourne", "shadow"].includes(explicit)) return "shadowmourne";
    if (["all", "global", "both"].includes(explicit)) return "all";

    // Older posts predate explicit realm scope. Infer only from their public title
    // and summary; launcher/site-wide posts remain visible to both realms.
    const publicText = `${post.title || ""} ${post.summary || ""}`.toLowerCase();
    const mentionsShadowmourne = publicText.includes("shadowmourne");
    const mentionsFrozenThrone = publicText.includes("frozenthrone");
    if (mentionsShadowmourne && !mentionsFrozenThrone) return "shadowmourne";
    if (mentionsFrozenThrone && !mentionsShadowmourne) return "main";
    return "all";
  }

  function postMatchesRealm(post, realm) {
    const scope = realmScopeOf(post);
    return scope === "all" || scope === realm.key;
  }

  async function newestMembers(realm) {
    const connection = await authDb(realm);
    try {
      const accountColumn = realm.accessAccountColumn;
      const levelColumn = realm.accessLevelColumn;
      const [rows] = await connection.execute(`
        SELECT a.id, a.username, a.joindate
        FROM account a
        WHERE UPPER(a.username) NOT LIKE 'RNDBOT%'
          AND UPPER(a.username) NOT LIKE 'RANDOMBOT%'
          AND UPPER(a.username) NOT LIKE 'BOT%'
          AND NOT EXISTS (
            SELECT 1
            FROM account_access staff_access
            WHERE staff_access.${accountColumn} = a.id
              AND staff_access.${levelColumn} > 2
              AND staff_access.RealmID IN (-1, ?)
          )
        ORDER BY a.joindate DESC, a.id DESC
        LIMIT 5
      `, [realm.realm_id]);
      return rows;
    } finally {
      await connection.end();
    }
  }

  async function recentForumThreads() {
    const connection = await mysql.createConnection({
      ...dbConfig,
      database: "frozenthrone"
    });
    try {
      const [rows] = await connection.execute(`
        SELECT
          t.id,
          t.title,
          t.replies,
          t.thread_type,
          t.updated_at,
          b.name AS board_name,
          a.username
        FROM forum_threads t
        JOIN forum_boards b ON b.id = t.board_id
        LEFT JOIN auth.account a ON a.id = t.author_id
        ORDER BY t.updated_at DESC, t.id DESC
        LIMIT 5
      `);
      return rows;
    } finally {
      await connection.end();
    }
  }

  function threadIcon(type) {
    return ({
      urgent: "🚨",
      important: "⭐",
      announcement: "📢",
      sticky: "📌"
    })[type] || "💬";
  }

  app.get("/home/home.css", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.sendFile(path.join(__dirname, "home.css"));
  });

  app.get(["/", "/index.html"], async (req, res) => {
    const realm = req.activeRealm;
    const realmDescription = realm.key === "shadowmourne"
      ? "Adventure with player bots and real heroes in a living Wrath world built so you never have to face Azeroth alone."
      : "The original FrozenThrone Wrath of the Lich King 3.3.5a realm—classic adventures, a growing community, and a world ready for your return.";

    const publishedPosts = readPosts()
      .filter(post => post.status === "published" && postMatchesRealm(post, realm))
      .sort((a, b) => {
        const aDate = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bDate = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bDate - aDate || Number(b.id || 0) - Number(a.id || 0);
      })
      .slice(0, 3);

    const [memberResult, forumResult] = await Promise.allSettled([
      newestMembers(realm),
      recentForumThreads()
    ]);

    const members = memberResult.status === "fulfilled" ? memberResult.value : [];
    const threads = forumResult.status === "fulfilled" ? forumResult.value : [];

    if (memberResult.status === "rejected") {
      console.error(`Homepage members failed for ${realm.key}:`, memberResult.reason.message);
    }
    if (forumResult.status === "rejected") {
      console.error("Homepage forum feed failed:", forumResult.reason.message);
    }

    const newsHtml = publishedPosts.map(post => `
      <article class="home-news-card">
        <a class="home-news-image" href="/news/${encodeURIComponent(post.slug || "")}">
          <img src="${esc(imageOf(post))}" alt="${esc(post.title)}">
          <span>${esc(post.type || post.category || "News")}</span>
        </a>
        <div class="home-news-copy">
          <p class="home-date">${esc(niceDate(post.createdAt, true))}</p>
          <h3><a href="/news/${encodeURIComponent(post.slug || "")}">${esc(post.title)}</a></h3>
          <p>${esc(post.summary || "Read the latest realm update.")}</p>
          <a class="home-text-link" href="/news/${encodeURIComponent(post.slug || "")}">Read dispatch →</a>
        </div>
      </article>
    `).join("");

    const forumHtml = threads.map(thread => `
      <a class="home-forum-row" href="/forums/thread/${thread.id}">
        <span class="home-forum-icon">${threadIcon(thread.thread_type)}</span>
        <span class="home-forum-copy">
          <strong>${esc(thread.title)}</strong>
          <small>${esc(thread.board_name)} · by ${esc(thread.username || "Unknown")}</small>
        </span>
        <span class="home-forum-meta">
          <strong>${esc(thread.replies || 0)}</strong>
          <small>replies</small>
        </span>
      </a>
    `).join("");

    const memberHtml = members.map(member => `
      <div class="home-member-row">
        <span class="home-member-avatar">${esc(String(member.username || "?").slice(0, 1).toUpperCase())}</span>
        <span>
          <strong>${esc(member.username || "Adventurer")}</strong>
          <small>Joined ${esc(niceDate(member.joindate, true))}</small>
        </span>
      </div>
    `).join("");

    render(req, res, `${realm.name} | Wrath of the Lich King 3.3.5a Private Server`, `
      <link rel="stylesheet" href="/home/home.css?v=1">
      <main class="home-page">
        <section class="home-hero">
          <video id="home-intro-video" class="home-hero-video" autoplay muted loop playsinline preload="metadata" poster="/images/frozenthrone-bg.jpeg">
            <source src="/images/intro.mp4" type="video/mp4">
          </video>
          <div class="home-hero-shade"></div>
          <div class="container home-hero-content">
            <p class="home-realm-pill"><span></span> Selected Realm: ${esc(realm.name)}</p>
            <h1>Enter ${esc(realm.name)}</h1>
            <p class="home-hero-lead">${esc(realmDescription)}</p>
            <div class="home-hero-actions">
              <a class="btn" href="${req.user ? "/account" : "/register"}">${req.user ? "Open Account Panel" : "Create Your Account"}</a>
              <a class="btn secondary" href="/download">Download Launcher</a>
              <button id="home-video-sound" class="home-sound-button" type="button" aria-pressed="false">🔇 Enable Intro Sound</button>
            </div>
            <p class="home-realmlist">Realmlist: <code>set realmlist frozenthrone.co</code></p>
          </div>
        </section>

        <section class="container home-stats" aria-label="Selected realm statistics">
          <div><span>Accounts</span><strong id="accounts">0</strong></div>
          <div><span>Characters</span><strong id="characters">0</strong></div>
          <div><span>Online Now</span><strong id="online">0</strong></div>
          <div><span>Active Realm</span><strong id="activeRealmName">${esc(realm.name)}</strong></div>
        </section>

        <section class="container home-news-section">
          <div class="home-section-heading">
            <div>
              <p class="eyebrow">Latest Dispatches</p>
              <h2>News for ${esc(realm.name)}</h2>
            </div>
            <a class="home-section-link" href="/news">View all news →</a>
          </div>
          <div class="home-news-grid">
            ${newsHtml || `<div class="home-empty"><h3>No realm news yet.</h3><p>New dispatches will appear here.</p></div>`}
          </div>
        </section>

        <section class="container home-community-grid">
          <article class="home-panel">
            <div class="home-panel-heading">
              <div><p class="eyebrow">Across Both Realms</p><h2>Recent Forum Activity</h2></div>
              <a href="/forums">Visit forums →</a>
            </div>
            <div class="home-forum-list">
              ${forumHtml || `<div class="home-empty"><p>No forum conversations yet.</p></div>`}
            </div>
          </article>

          <aside class="home-panel home-members-panel">
            <div class="home-panel-heading">
              <div><p class="eyebrow">${esc(realm.name)}</p><h2>Newest Members</h2></div>
              <a href="/players">Players →</a>
            </div>
            <div class="home-member-list">
              ${memberHtml || `<div class="home-empty"><p>No new members found.</p></div>`}
            </div>
          </aside>
        </section>

        <section class="container home-final-cta">
          <div>
            <p class="eyebrow">Your Journey Starts Here</p>
            <h2>Ready to enter ${esc(realm.name)}?</h2>
            <p>Choose your realm above, create an account, and let the FrozenThrone Launcher handle the rest.</p>
          </div>
          <div>
            <a class="btn" href="${req.user ? "/account" : "/register"}">${req.user ? "My Account" : "Join Now"}</a>
            <a class="btn secondary" href="/download">Get the Launcher</a>
          </div>
        </section>
      </main>

      <script>
      (() => {
        const video = document.getElementById("home-intro-video");
        const button = document.getElementById("home-video-sound");
        if (!video || !button) return;

        button.addEventListener("click", async () => {
          video.muted = !video.muted;
          if (video.paused) {
            try { await video.play(); } catch {}
          }
          button.setAttribute("aria-pressed", String(!video.muted));
          button.textContent = video.muted ? "🔇 Enable Intro Sound" : "🔊 Mute Intro Sound";
        });
      })();
      </script>
    `, {
      seo: {
        description: realmDescription,
        image: "/images/logo.png"
      }
    });
  });
};
