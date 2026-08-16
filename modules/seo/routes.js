const { readPosts } = require("../news/engine");
const { SITE_URL, absoluteUrl } = require("./seo");

const PUBLIC_PAGES = Object.freeze([
  "/",
  "/news",
  "/download",
  "/register",
  "/vote",
  "/forums",
  "/armory",
  "/guilds"
]);

function xmlEscape(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function publishedPosts() {
  return readPosts()
    .filter(post => post.status === "published" && post.slug)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function isoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

module.exports = function registerSeoRoutes(app) {
  app.get("/robots.txt", (req, res) => {
    res.type("text/plain");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(`User-agent: *
Allow: /
Disallow: /admin/
Disallow: /account
Disallow: /login
Disallow: /logout
Disallow: /api/
Disallow: /shop
Disallow: /renders/
Disallow: /dev/
Disallow: /modelviewer/
Disallow: /wotlk-items/
Disallow: /armory-portrait/

Sitemap: ${SITE_URL}/sitemap.xml
`);
  });

  app.get("/sitemap.xml", (req, res) => {
    const staticUrls = PUBLIC_PAGES.map(page => `
  <url>
    <loc>${xmlEscape(absoluteUrl(page))}</loc>
  </url>`).join("");

    const articleUrls = publishedPosts().map(post => {
      const pageUrl = absoluteUrl(`/news/${encodeURIComponent(post.slug)}`);
      const imageUrl = absoluteUrl(post.heroImage || post.image || "/images/logo.png");
      const lastModified = isoDate(post.updatedAt || post.createdAt);
      return `
  <url>
    <loc>${xmlEscape(pageUrl)}</loc>
    ${lastModified ? `<lastmod>${xmlEscape(lastModified)}</lastmod>` : ""}
    <image:image>
      <image:loc>${xmlEscape(imageUrl)}</image:loc>
      <image:title>${xmlEscape(post.title || "FrozenThrone News")}</image:title>
    </image:image>
  </url>`;
    }).join("");

    res.type("application/xml");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${staticUrls}${articleUrls}
</urlset>`);
  });

  app.get("/news.xml", (req, res) => {
    const items = publishedPosts().slice(0, 50).map(post => {
      const pageUrl = absoluteUrl(`/news/${encodeURIComponent(post.slug)}`);
      const published = isoDate(post.createdAt || post.updatedAt) || new Date().toISOString();
      return `
    <item>
      <title>${xmlEscape(post.title || "FrozenThrone News")}</title>
      <link>${xmlEscape(pageUrl)}</link>
      <guid isPermaLink="true">${xmlEscape(pageUrl)}</guid>
      <pubDate>${xmlEscape(new Date(published).toUTCString())}</pubDate>
      <description>${xmlEscape(post.summary || "Read the latest FrozenThrone realm update.")}</description>
    </item>`;
    }).join("");

    res.type("application/rss+xml");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>FrozenThrone News</title>
    <link>${SITE_URL}/news</link>
    <description>FrozenThrone realm announcements, guides, events, development updates, and launcher news.</description>
    <language>en-us</language>${items}
  </channel>
</rss>`);
  });
};
