const path = require("path");
const { readPosts } = require("./engine");

module.exports = function registerPublicNewsRoutes(app, tools) {
  const { render, esc, errorCard } = tools;

  const imageOf = post => post.heroImage || post.image || "/images/frozenthrone-bg.jpeg";
  const typeOf = post => post.type || post.category || "News";

  const prettyDate = value => {
    if (!value) return "Latest update";
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    });
  };

  const badges = post => `
    <div class="newsroom-badges">
      <span class="newsroom-category">${esc(typeOf(post))}</span>
      ${post.featured ? `<span class="newsroom-flag">Featured</span>` : ""}
      ${post.pinned ? `<span class="newsroom-flag">Pinned</span>` : ""}
    </div>`;

  app.get("/news/news.css", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.sendFile(path.join(__dirname, "news.css"));
  });

  app.get(["/news", "/news.html"], (req, res) => {
    const posts = readPosts()
      .filter(post => post.status === "published")
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    if (!posts.length) {
      return render(req, res, "News", `
        <link rel="stylesheet" href="/news/news.css">
        <main class="container newsroom-empty">
          <section>
            <p class="eyebrow">The FrozenThrone Chronicle</p>
            <h1>News From Azeroth</h1>
            <div class="card"><h3>No dispatches yet.</h3><p class="muted">Check back soon.</p></div>
          </section>
        </main>`);
    }

    const leadPost = posts.find(post => post.featured) || posts[0];
    const remaining = posts.filter(post => Number(post.id) !== Number(leadPost.id));
    const spotlightPosts = remaining.slice(0, 2);
    const archivePosts = remaining.slice(2);
    const categories = [...new Set(posts.map(typeOf))];

    const leadStory = `
      <article class="newsroom-lead-story">
        <img src="${esc(imageOf(leadPost))}" alt="${esc(leadPost.title)}">
        <div class="newsroom-lead-shade"></div>
        <div class="newsroom-lead-content">
          ${badges(leadPost)}
          <p class="newsroom-date">${esc(prettyDate(leadPost.createdAt))}</p>
          <h2>${esc(leadPost.title)}</h2>
          <p>${esc(leadPost.summary || "Read the latest FrozenThrone realm update.")}</p>
          <a class="btn" href="/news/${encodeURIComponent(leadPost.slug || "")}">Read Full Dispatch</a>
        </div>
      </article>`;

    const spotlight = spotlightPosts.map(post => `
      <article class="newsroom-spotlight-story">
        <img src="${esc(imageOf(post))}" alt="${esc(post.title)}">
        <div class="newsroom-spotlight-shade"></div>
        <div class="newsroom-spotlight-content">
          ${badges(post)}
          <p class="newsroom-date">${esc(prettyDate(post.createdAt))}</p>
          <h3><a href="/news/${encodeURIComponent(post.slug || "")}">${esc(post.title)}</a></h3>
        </div>
      </article>
    `).join("");

    const archive = archivePosts.map(post => `
      <article class="newsroom-list-story">
        <a class="newsroom-list-image" href="/news/${encodeURIComponent(post.slug || "")}" aria-label="Read ${esc(post.title)}">
          <img src="${esc(imageOf(post))}" alt="">
        </a>
        <div class="newsroom-list-copy">
          ${badges(post)}
          <p class="newsroom-date">${esc(prettyDate(post.createdAt))}</p>
          <h3><a href="/news/${encodeURIComponent(post.slug || "")}">${esc(post.title)}</a></h3>
          <p>${esc(post.summary || "Open this dispatch for the full story.")}</p>
        </div>
        <a class="newsroom-list-arrow" href="/news/${encodeURIComponent(post.slug || "")}" aria-label="Read ${esc(post.title)}">→</a>
      </article>
    `).join("");

    render(req, res, "News", `
      <link rel="stylesheet" href="/news/news.css">
      <main class="newsroom-page">
        <section class="container newsroom-masthead">
          <div>
            <p class="eyebrow">The FrozenThrone Chronicle</p>
            <h1>News From Azeroth</h1>
            <p class="lead">Realm announcements, development reports, launcher releases, events, and stories from the FrozenThrone community.</p>
          </div>
          <div class="newsroom-edition">
            <span>Current Edition</span>
            <strong>${posts.length}</strong>
            <small>Published Dispatches</small>
          </div>
        </section>

        <div class="container newsroom-categories" aria-label="News categories">
          <span>Explore:</span>
          ${categories.map(category => `<span class="newsroom-category-chip">${esc(category)}</span>`).join("")}
        </div>

        <section class="container newsroom-headlines">
          ${leadStory}
          <div class="newsroom-spotlight-stack">
            ${spotlight || `<div class="card"><h3>More updates are coming.</h3><p class="muted">Watch this space for the next dispatch.</p></div>`}
          </div>
        </section>

        ${archivePosts.length ? `
          <section class="container newsroom-archive">
            <div class="newsroom-section-title">
              <div><p class="eyebrow">From the Archive</p><h2>More Dispatches</h2></div>
              <span>${archivePosts.length} stories</span>
            </div>
            <div class="newsroom-list">${archive}</div>
          </section>` : ""}
      </main>
    `);
  });

  app.get("/news/:slug", (req, res) => {
    const post = readPosts().find(item =>
      item.slug === req.params.slug && item.status === "published"
    );

    if (!post) {
      return render(req, res, "News", errorCard("News post not found."));
    }

    render(req, res, post.title, `
      <link rel="stylesheet" href="/news/news.css">
      <main class="container newsroom-article-page">
        <a class="newsroom-back" href="/news">← All Dispatches</a>
        <article class="newsroom-article">
          <header class="newsroom-article-hero">
            <img src="${esc(imageOf(post))}" alt="${esc(post.title)}">
            <div class="newsroom-article-shade"></div>
            <div class="newsroom-article-heading">
              ${badges(post)}
              <p class="newsroom-date">${esc(prettyDate(post.createdAt))}</p>
              <h1>${esc(post.title)}</h1>
              <p>${esc(post.summary || "")}</p>
            </div>
          </header>
          <div class="newsroom-article-body">${post.body || ""}</div>
        </article>
      </main>
    `, {
      seo: {
        description: post.summary || post.title,
        image: imageOf(post),
        type: "article"
      }
    });
  });
};
