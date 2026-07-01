function escMeta(v = "") {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildMeta({
  title = "FrozenThrone | Wrath of the Lich King 3.3.5a Private Server",
  description = "FrozenThrone is a custom Wrath of the Lich King 3.3.5a server featuring a live 3D Armory, player database, guild tracking, custom content, events, and an active community.",
  url = "https://frozenthrone.co/",
  image = "/images/frozenthrone-bg.jpeg",
  type = "website"
} = {}) {
  return `
<meta name="description" content="${escMeta(description)}">
<link rel="canonical" href="${escMeta(url)}">

<meta property="og:type" content="${escMeta(type)}">
<meta property="og:title" content="${escMeta(title)}">
<meta property="og:description" content="${escMeta(description)}">
<meta property="og:url" content="${escMeta(url)}">
<meta property="og:image" content="${escMeta(image)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escMeta(title)}">
<meta name="twitter:description" content="${escMeta(description)}">
<meta name="twitter:image" content="${escMeta(image)}">
`.trim();
}

module.exports = { buildMeta };
