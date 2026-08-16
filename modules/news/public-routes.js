const path = require("path");
const { readPosts } = require("./engine");
const { SITE_URL, absoluteUrl } = require("../seo/seo");

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

  const isoDate = value => {
    if (!value) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
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
        </main>`, {
          seo: {
            title: "FrozenThrone News, Updates & Guides",
            description: "Read FrozenThrone realm announcements, development updates, patch notes, launcher releases, events, community guides, and server news.",
            url: `${SITE_URL}/news`
          }
        });
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
    `, {
      seo: {
        title: "FrozenThrone News, Updates & Guides",
        description: "Read FrozenThrone realm announcements, development updates, patch notes, launcher releases, events, community guides, and server news.",
        url: `${SITE_URL}/news`,
        image: imageOf(leadPost),
        imageAlt: leadPost.title
      }
    });
  });

  app.get("/news/:slug", (req, res) => {
    const post = readPosts().find(item =>
      item.slug === req.params.slug && item.status === "published"
    );

    if (!post) {
      return render(req, res, "News", errorCard("News post not found."));
    }

    const canonicalUrl = `${SITE_URL}/news/${encodeURIComponent(post.slug || "")}`;
    const articleImage = absoluteUrl(imageOf(post));
    const publishedTime = isoDate(post.createdAt);
    const modifiedTime = isoDate(post.updatedAt || post.createdAt);
    const articleDescription = post.summary || post.title;
    const articleSection = typeOf(post);
    const keywords = String(post.tags || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);

    const newsArticle = {
      "@type": "NewsArticle",
      "@id": `${canonicalUrl}#article`,
      mainEntityOfPage: { "@id": `${canonicalUrl}#webpage` },
      headline: post.title,
      description: articleDescription,
      image: [articleImage],
      ...(publishedTime ? { datePublished: publishedTime } : {}),
      ...(modifiedTime ? { dateModified: modifiedTime } : {}),
      author: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "FrozenThrone Team" },
      publisher: { "@id": `${SITE_URL}/#organization` },
      articleSection,
      ...(keywords.length ? { keywords } : {}),
      isAccessibleForFree: true,
      inLanguage: "en-US"
    };

    const breadcrumbs = {
      "@type": "BreadcrumbList",
      "@id": `${canonicalUrl}#breadcrumbs`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "News", item: `${SITE_URL}/news` },
        { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl }
      ]
    };

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
        description: articleDescription,
        url: canonicalUrl,
        image: articleImage,
        imageAlt: post.title,
        type: "article",
        publishedTime,
        modifiedTime,
        structuredData: [newsArticle, breadcrumbs]
      }
    });
  });
};
