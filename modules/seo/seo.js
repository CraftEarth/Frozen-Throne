const SITE_URL = "https://frozenthrone.co";
const SITE_NAME = "FrozenThrone";
const DEFAULT_IMAGE = "/images/logo.png";
const DEFAULT_DESCRIPTION = "Join FrozenThrone, an independent Wrath of the Lich King 3.3.5a private server community featuring FrozenThrone and Shadowmourne realms, a live Armory, forums, events, voting rewards, and custom content.";

const PAGE_DESCRIPTIONS = Object.freeze({
  "/": "Play Wrath of the Lich King 3.3.5a on FrozenThrone. Explore our FrozenThrone and Shadowmourne realms, community forums, live Armory, events, launcher, and Vote Token rewards.",
  "/news": "Read FrozenThrone realm announcements, development updates, patch notes, launcher releases, events, community guides, and server news.",
  "/download": "Download the FrozenThrone launcher for Wrath of the Lich King 3.3.5a, install or repair your client, and connect to every available realm.",
  "/register": "Create a FrozenThrone account for the FrozenThrone realm, Shadowmourne realm, or both, then join our Wrath of the Lich King 3.3.5a community.",
  "/vote": "Vote for FrozenThrone every six hours, support the server, and earn Vote Tokens for mounts, pets, consumables, bags, and other in-game rewards.",
  "/forums": "Join the FrozenThrone community forums for realm announcements, player support, guides, suggestions, bug reports, events, and meaningful discussions.",
  "/armory": "Explore the FrozenThrone live Armory and character database for public characters, guilds, rankings, equipment, achievements, and realm activity.",
  "/guilds": "Browse FrozenThrone and Shadowmourne guilds, rosters, leaders, membership, and live realm community information.",
  "/players": "Explore FrozenThrone and Shadowmourne player rankings, characters, classes, guilds, achievements, honorable kills, playtime, wealth, and current online activity."
});

function escMeta(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function absoluteUrl(value, fallback = SITE_URL) {
  try {
    return new URL(String(value || fallback), SITE_URL).toString();
  } catch {
    return fallback;
  }
}

function pathnameOf(url) {
  try {
    const pathname = new URL(url, SITE_URL).pathname;
    return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  } catch {
    return "/";
  }
}

function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildMeta({
  title = "FrozenThrone | Wrath of the Lich King 3.3.5a Private Server",
  description,
  url = `${SITE_URL}/`,
  image = DEFAULT_IMAGE,
  imageAlt,
  type = "website",
  robots = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  publishedTime,
  modifiedTime,
  structuredData = []
} = {}) {
  const canonicalUrl = absoluteUrl(url, `${SITE_URL}/`);
  const pagePath = pathnameOf(canonicalUrl);
  const resolvedDescription = String(description || PAGE_DESCRIPTIONS[pagePath] || DEFAULT_DESCRIPTION).trim();
  const imageUrl = absoluteUrl(image || DEFAULT_IMAGE, absoluteUrl(DEFAULT_IMAGE));
  const resolvedImageAlt = String(imageAlt || title || SITE_NAME).trim();
  const extras = Array.isArray(structuredData) ? structuredData : [structuredData];

  const graph = [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: {
        "@type": "ImageObject",
        "@id": `${SITE_URL}/#logo`,
        url: absoluteUrl("/images/logo.png"),
        contentUrl: absoluteUrl("/images/logo.png"),
        caption: "FrozenThrone Wrath of the Lich King 3.3.5a"
      },
      sameAs: ["https://github.com/CraftEarth/Frozen-Throne"]
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-US"
    },
    {
      "@type": "WebPage",
      "@id": `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: title,
      description: resolvedDescription,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#organization` },
      primaryImageOfPage: { "@type": "ImageObject", url: imageUrl },
      inLanguage: "en-US"
    },
    ...extras.filter(Boolean)
  ];

  return `
<meta name="description" content="${escMeta(resolvedDescription)}">
<meta name="robots" content="${escMeta(robots)}">
<meta name="googlebot" content="${escMeta(robots)}">
<meta name="theme-color" content="#06182b">
<link rel="canonical" href="${escMeta(canonicalUrl)}">
<link rel="alternate" type="application/rss+xml" title="FrozenThrone News" href="${SITE_URL}/news.xml">

<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="en_US">
<meta property="og:type" content="${escMeta(type)}">
<meta property="og:title" content="${escMeta(title)}">
<meta property="og:description" content="${escMeta(resolvedDescription)}">
<meta property="og:url" content="${escMeta(canonicalUrl)}">
<meta property="og:image" content="${escMeta(imageUrl)}">
<meta property="og:image:secure_url" content="${escMeta(imageUrl)}">
<meta property="og:image:alt" content="${escMeta(resolvedImageAlt)}">
${publishedTime ? `<meta property="article:published_time" content="${escMeta(publishedTime)}">` : ""}
${modifiedTime ? `<meta property="article:modified_time" content="${escMeta(modifiedTime)}">` : ""}
${type === "article" ? `<meta property="article:publisher" content="${SITE_URL}/">` : ""}

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escMeta(title)}">
<meta name="twitter:description" content="${escMeta(resolvedDescription)}">
<meta name="twitter:image" content="${escMeta(imageUrl)}">
<meta name="twitter:image:alt" content="${escMeta(resolvedImageAlt)}">

<script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@graph": graph })}</script>
`.trim();
}

module.exports = {
  SITE_URL,
  SITE_NAME,
  DEFAULT_DESCRIPTION,
  absoluteUrl,
  buildMeta
};
