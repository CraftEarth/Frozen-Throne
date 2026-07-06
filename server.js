require("dotenv").config();

const fs = require("fs");

let itemIcons = {};
try {
  itemIcons = JSON.parse(fs.readFileSync(__dirname + "/item-icons.json", "utf8"));
} catch (err) {
  console.warn("item-icons.json not loaded:", err.message);
}

function itemIconUrl(displayid) {
  const icon = itemIcons[String(displayid)];
  if (!icon) return "https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg";
  return `https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg`;
}

const express = require("express");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const path = require("path");
const { buildMeta } = require("./modules/seo/seo");
const registerArmoryRoutes = require("./modules/armory/routes");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-session-secret-now";
const sessions = new Map();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/css", express.static(path.join(__dirname, "public/css")));
app.use("/images", express.static(path.join(__dirname, "public/images")));
app.use("/renders", express.static(path.join(__dirname, "public/renders")));
app.use("/vendor", express.static(path.join(__dirname, "public/vendor")));
app.use("/js", express.static(path.join(__dirname, "public/js")));
app.use("/dev", express.static(path.join(__dirname, "public/dev")));




app.use("/wotlk-items", async (req, res) => {
  const https = require("https");
  const fs = require("fs");
  const path = require("path");

  const cacheDir = path.join(__dirname, "cache");
  const cacheFile = path.join(cacheDir, "wotlk-display-cache.json");

  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch {}

  const key = req.url.replace(/[^0-9/]/g, "");
  const fallbackDisplay = Number(req.url.split("/").filter(Boolean).pop() || 0);

  if (cache[key]) {
    res.setHeader("Cache-Control", "public, max-age=604800");
    return res.json(cache[key]);
  }

  const target = "https://wotlk.murlocvillage.com/api/items" + req.url;

  https.get(target, upstream => {
    let body = "";
    upstream.on("data", chunk => body += chunk);
    upstream.on("end", () => {
      try {
        const json = JSON.parse(body);
        const result = json && typeof json.newDisplayId !== "undefined"
          ? json
          : { newDisplayId: fallbackDisplay };

        cache[key] = result;
        fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));

        res.setHeader("Cache-Control", "public, max-age=604800");
        res.json(result);
      } catch (e) {
        const result = { newDisplayId: fallbackDisplay };
        cache[key] = result;
        fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
        res.json(result);
      }
    });
  }).on("error", err => {
    console.error("WotLK item proxy error:", err.message);
    const result = { newDisplayId: fallbackDisplay };
    cache[key] = result;
    try { fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2)); } catch {}
    res.json(result);
  });
});


app.use("/modelviewer", async (req, res) => {
  const https = require("https");
  const target = "https://wow.zamimg.com/modelviewer" + req.url;

  https.get(target, upstream => {
    res.status(upstream.statusCode || 200);
    if (upstream.headers["content-type"]) {
      res.setHeader("content-type", upstream.headers["content-type"]);
    }
    res.setHeader("Cache-Control", "public, max-age=604800");
    upstream.pipe(res);
  }).on("error", err => {
    console.error("Modelviewer proxy error:", err.message);
    res.status(502).send("Modelviewer proxy failed");
  });
});


app.get("/armory-viewer-test.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public/armory-viewer-test.html"));
});

app.use("/downloads", express.static(path.join(__dirname, "public/downloads")));

const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_AUTH || "auth",
};

const realms = [
  { key: "main", name: "FrozenThrone", db: "characters", port: 8085, public: true },
  { key: "beta", name: "FrozenThrone Beta", db: "characters_beta", port: 8086, public: false },
];

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (!rawName) continue;
    cookies[rawName] = decodeURIComponent(rest.join("="));
  }
  return cookies;
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function createSession(res, account) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    id: account.id,
    username: account.username,
    createdAt: Date.now(),
  });
  const cookie = `${token}.${sign(token)}`;
  res.setHeader("Set-Cookie", `ft_session=${encodeURIComponent(cookie)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`);
}

function destroySession(req, res) {
  const raw = parseCookies(req).ft_session;
  if (raw) {
    const [token] = raw.split(".");
    sessions.delete(token);
  }
  res.setHeader("Set-Cookie", "ft_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function getSession(req) {
  const raw = parseCookies(req).ft_session;
  if (!raw) return null;
  const [token, signature] = raw.split(".");
  if (!token || !signature || sign(token) !== signature) return null;
  return sessions.get(token) || null;
}

app.use((req, res, next) => {
  req.user = getSession(req);
  next();
});


async function getUserSecurityLevel(accountId, realmId = -1) {
  if (!accountId) return 0;
  const conn = await authDb();
  try {
    const [rows] = await conn.execute(
      `SELECT MAX(SecurityLevel) AS level
       FROM account_access
       WHERE AccountID = ?
       AND (RealmID = -1 OR RealmID = ?)`,
      [accountId, realmId]
    );
    return Number(rows?.[0]?.level || 0);
  } finally {
    await conn.end();
  }
}

function requireLogin(req, res, next) {
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  next();
}

async function authDb() {
  return mysql.createConnection(dbConfig);
}

async function characterDb(database) {
  return mysql.createConnection({ ...dbConfig, database });
}

function worldDb(database = process.env.DB_WORLD || "world") {
  return mysql.createConnection({ ...dbConfig, database });
}


function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  return raw.split(";").map(v => v.trim()).reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return acc;
    const key = decodeURIComponent(part.slice(0, idx));
    const val = decodeURIComponent(part.slice(idx + 1));
    acc[key] = val;
    return acc;
  }, {})[name];
}

async function loadRealmConfigs() {
  const conn = await authDb();
  try {
    const [rows] = await conn.execute(
      `SELECT realm_id, realm_key, display_name, world_db, characters_db, auth_db, is_production, enabled
       FROM ft_realm_config
       WHERE enabled = 1
       ORDER BY is_production DESC, realm_id ASC`
    );
    return rows;
  } finally {
    await conn.end();
  }
}

async function getActiveRealm(req) {
  const configs = await loadRealmConfigs();
  const requested = req.query.realm || getCookie(req, "ft_active_realm");

  const found = configs.find(r =>
    r.realm_key === requested || String(r.realm_id) === String(requested)
  );

  return found || configs[0] || {
    realm_id: 1,
    realm_key: "main",
    display_name: "FrozenThrone Production",
    world_db: "world",
    characters_db: "characters",
    auth_db: "auth",
    is_production: 1
  };
}

function realmBadge(realm) {
  const prod = Number(realm.is_production) === 1;
  return `<div class="card highlight realm-banner">
    <strong>${prod ? "🟢 PRODUCTION" : "🟠 BETA / TEST"}</strong>
    <span>Active Realm: ${esc(realm.display_name)}</span>
    <span class="muted">World DB: ${esc(realm.world_db)} · Characters DB: ${esc(realm.characters_db)}</span>
  </div>`;
}


function getRealm(key) {
  return realms.find((realm) => realm.key === key) || null;
}

const equipmentSlots = {
  0: "Head",
  1: "Neck",
  2: "Shoulders",
  3: "Shirt",
  4: "Chest",
  5: "Waist",
  6: "Legs",
  7: "Feet",
  8: "Wrists",
  9: "Hands",
  10: "Finger 1",
  11: "Finger 2",
  12: "Trinket 1",
  13: "Trinket 2",
  14: "Back",
  15: "Main Hand",
  16: "Off Hand",
  17: "Ranged",
  18: "Tabard",
};

function itemQualityName(id) {
  return ({ 0: "Poor", 1: "Common", 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary", 6: "Artifact", 7: "Heirloom" })[id] || `Quality ${id}`;
}

async function databaseExists(database) {
  const conn = await authDb();
  const [rows] = await conn.execute("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [database]);
  await conn.end();
  return rows.length > 0;
}

function sha1(...parts) {
  const h = crypto.createHash("sha1");
  for (const part of parts) h.update(part);
  return h.digest();
}

function modPow(base, exp, mod) {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function bigIntToLeBuffer(num, len) {
  let hex = num.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  let buf = Buffer.from(hex, "hex").reverse();
  if (buf.length < len) buf = Buffer.concat([buf, Buffer.alloc(len - buf.length)]);
  return buf.slice(0, len);
}

function makeSrp6(username, password) {
  username = username.toUpperCase();
  password = password.toUpperCase();
  const g = 7n;
  const N = BigInt("0x894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7");
  const salt = crypto.randomBytes(32);
  const inner = sha1(Buffer.from(`${username}:${password}`));
  const xHash = sha1(salt, inner);
  const x = BigInt("0x" + Buffer.from(xHash).reverse().toString("hex"));
  const verifierNum = modPow(g, x, N);
  const verifier = bigIntToLeBuffer(verifierNum, 32);
  return { salt, verifier };
}

function verifySrp6(username, password, salt, verifier) {
  const check = makeVerifierWithSalt(username, password, Buffer.from(salt));
  return crypto.timingSafeEqual(Buffer.from(verifier), check);
}

function makeVerifierWithSalt(username, password, salt) {
  username = username.toUpperCase();
  password = password.toUpperCase();
  const g = 7n;
  const N = BigInt("0x894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7");
  const inner = sha1(Buffer.from(`${username}:${password}`));
  const xHash = sha1(salt, inner);
  const x = BigInt("0x" + Buffer.from(xHash).reverse().toString("hex"));
  return bigIntToLeBuffer(modPow(g, x, N), 32);
}

function className(id) {
  return ({ 1: "Warrior", 2: "Paladin", 3: "Hunter", 4: "Rogue", 5: "Priest", 6: "Death Knight", 7: "Shaman", 8: "Mage", 9: "Warlock", 11: "Druid" })[id] || `Class ${id}`;
}

function raceName(id) {
  return ({ 1: "Human", 2: "Orc", 3: "Dwarf", 4: "Night Elf", 5: "Undead", 6: "Tauren", 7: "Gnome", 8: "Troll", 10: "Blood Elf", 11: "Draenei" })[id] || `Race ${id}`;
}

function moneyToGold(copper = 0) {
  return Math.floor(Number(copper || 0) / 10000).toLocaleString();
}

function render(req, res, title, body, options = {}) {
  const user = req.user;
  const flash = options.flash || "";
  const siteUrl = "https://frozenthrone.co";
  const fullTitle = options.seo?.title || `${title} - FrozenThrone`;
  const seoMeta = buildMeta({
    title: fullTitle,
    description: options.seo?.description,
    url: options.seo?.url || `${siteUrl}${req.originalUrl.split("?")[0]}`,
    image: options.seo?.image,
    type: options.seo?.type || "website"
  });

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(fullTitle)}</title>
  ${seoMeta}
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/frozen-ui.css">
<script>
function copyAdminText(text) {
  navigator.clipboard.writeText(text).then(() => alert("Copied: " + text));
}
</script>
</head>
<body>
<div class="site-bg">
<header class="navbar">
  <div class="nav-inner">
    <a class="logo" href="/">FrozenThrone<small>WotLK 3.3.5a</small></a>
    <nav class="nav-links">
      ${req.path.startsWith("/admin")
        ? `
          <a href="/admin">Dashboard</a>
          <a href="/admin/search">Search</a>
          <a href="/admin/npcs">NPCs</a>
          <a href="/admin/items">Items</a>
          <a href="/admin/quests">Quests</a>
          <a href="/admin/mail">Mail</a>
          <a href="/admin/logs">Logs</a>
        `
        : `
          <a href="/">Home</a>
          <a href="/news">News</a>
          <a href="/armory">Database</a>
          <a href="/guilds">Guilds</a>
          <a href="/rankings">Rankings</a>
          <a href="/download">Download</a>
          <a href="/vote">Vote</a>
          <a href="/shop">Shop</a>
          <a href="/players">Players</a>
          <a href="/npc">NPC</a>
          <a href="/forums">Forums</a>
        `
      }
    </nav>
    <div class="nav-actions">
      <span class="status-dot" id="realm-status-small">Realm</span>
      ${user ? `<a class="btn secondary" href="/account">${esc(user.username)}</a><a class="btn" href="/logout">Logout</a>` : `<a class="btn secondary" href="/login">Login</a><a class="btn" href="/register">Play Now</a>`}
    </div>
  </div>
</header>
${flash ? `<div class="container"><div class="alert">${esc(flash)}</div></div>` : ""}
${body}
<footer class="footer">
  <strong>FrozenThrone</strong> © 2026 · Wrath of the Lich King 3.3.5a · Production + Beta Development Realm
  <div class="footer-links">
    <a href="/download">Download</a><a href="/register">Create Account</a><a href="/login">Login</a><a href="/guilds">Guilds</a>
      <a href="/players">Players</a><a href="/account">Account</a>
  </div>
</footer>
</div>
<script>
async function loadStats(){
  try{
    const r = await fetch('/stats');
    const data = await r.json();
    const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    set('accounts', data.accounts ?? '0');
    set('characters', data.characters ?? '0');
    set('online', data.online ?? '0');
    set('betaCharacters', data.betaCharacters ?? '0');
    set('realm-status-small', data.status || 'Realm');
  }catch(e){}
}
loadStats();
</script>
</body>
</html>`);
}



app.get("/players", (req, res) => res.redirect("/armory?tab=characters"));
app.get("/rankings", (req, res) => render(req, res, "Rankings", `<main class="ft-shell"><section class="ft-frame"><div class="ft-section-tabs"><a class="active">Level</a><a>PvP</a><a>Guilds</a><a>Richest</a></div><div class="ft-panel"><h1>Rankings</h1><p class="muted">Rankings engine coming next.</p></div></section></main>`));
app.get("/forums", (req, res) => render(req, res, "Forums", `<main class="ft-shell"><section class="ft-frame"><div class="ft-section-tabs"><a class="active">General</a><a>Guides</a><a>Bug Reports</a><a>Suggestions</a><a>Support</a></div><div class="ft-panel"><h1>Forums</h1><p class="muted">Forum system coming soon.</p></div></section></main>`));


app.get("/database", (req, res) => res.redirect("/armory/characters"));


registerArmoryRoutes(app, {
  render,
  errorCard,
  esc,
  realms,
  getRealm,
  databaseExists,
  characterDb,
  worldDb,
  raceName,
  className,
  moneyToGold,
  itemIconUrl,
  itemQualityName
});

app.get(["/", "/index.html"], (req, res) => {
  render(req, res, "FrozenThrone | Wrath of the Lich King 3.3.5a Private Server", `<main>
  <section class="hero">
    <div class="hero-card">
      <div class="eyebrow">Blizzlike x1 Realm</div>
      <h1>FrozenThrone</h1>
      <p class="lead">Wrath of the Lich King 3.3.5a private server with a stable production realm and a separate Beta realm for future features.</p>
      <p>Realmlist: <code>set realmlist 51.81.87.159</code></p>
      <a class="btn" href="${req.user ? "/account" : "/register"}">${req.user ? "Account Panel" : "Create Account"}</a>
      <a class="btn secondary" href="/download">Download Client</a>
    </div>
  </section>
  <section class="container">
    <div class="grid grid-4">
      <div class="card stat"><span>Accounts</span><strong id="accounts">0</strong></div>
      <div class="card stat"><span>Characters</span><strong id="characters">0</strong></div>
      <div class="card stat"><span>Online</span><strong id="online">0</strong></div>
      <div class="card stat"><span>Beta Characters</span><strong id="betaCharacters">0</strong></div>
    </div>
  </section>
  <section class="container">
    <div class="grid grid-3">
      <div class="card highlight"><h3>Production Realm</h3><p class="muted">FrozenThrone is the stable live realm. Player progress here is permanent.</p></div>
      <div class="card"><h3>Beta Realm</h3><p class="muted">FrozenThrone Beta is for testing. Beta progress does not transfer to production.</p></div>
      <div class="card"><h3>Account System</h3><p class="muted">Website login now uses TrinityCore auth, preparing the foundation for vote rewards and the shop.</p></div>
    </div>
  </section>
</main>`);
});

app.get(["/download", "/download.html"], (req, res) => {
  render(req, res, "Download FrozenThrone | WotLK 3.3.5a", `<main class="container"><section>
    <div class="section-head"><h1>Download & Connect</h1><p>Follow these steps to join FrozenThrone.</p></div>
    <div class="grid grid-2 steps">
      <div class="card step"><h3>Download Client</h3><p class="muted">Use a Wrath of the Lich King 3.3.5a client.</p><a class="btn" href="/downloads/FrozenThrone_3.3.5a.zip">Download Client</a></div>
      <div class="card step"><h3>Set Realmlist</h3><p>Open your realmlist file and set it to:</p><p><code>set realmlist 51.81.87.159</code></p></div>
      <div class="card step"><h3>Create Account</h3><p class="muted">Register your account before logging into the game client.</p><a class="btn secondary" href="/register">Create Account</a></div>
      <div class="card step"><h3>Choose Realm</h3><p class="muted">Use FrozenThrone for live play. Use FrozenThrone Beta only for testing.</p></div>
    </div>
  </section></main>`);
});

app.get(["/features", "/features.html"], (req, res) => {
  render(req, res, "Features", `<main class="container"><section>
    <div class="section-head"><h1>Server Features</h1><p>Wrath 3.3.5a, x1 progression, account tools, and a separate Beta realm for safe development.</p></div>
    <div class="grid grid-3">
      <div class="card"><h3>Wrath 3.3.5a</h3><p class="muted">Northrend, death knights, dungeons, raids, battlegrounds, and classic Wrath gameplay.</p></div>
      <div class="card"><h3>Blizzlike Progression</h3><p class="muted">x1 XP, drops, gold, honor, and reputation.</p></div>
      <div class="card"><h3>Dual Realm Setup</h3><p class="muted">Production stays safe while new systems are tested on Beta.</p></div>
      <div class="card"><h3>Website Accounts</h3><p class="muted">Login is tied to TrinityCore auth, ready for votes and shop rewards.</p></div>
      <div class="card"><h3>Player Rankings</h3><p class="muted">Live top level, gold, kills, and online activity from the character database.</p></div>
      <div class="card"><h3>Future Custom Content</h3><p class="muted">PlayerBots, teleporters, rewards, events, vendors, and custom systems can be tested safely.</p></div>
    </div>
  </section></main>`);
});


const NEWS_FILE = path.join(__dirname, "data/news/posts.json");

function readNewsPosts() {
  try {
    return JSON.parse(fs.readFileSync(NEWS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeNewsPosts(posts) {
  fs.mkdirSync(path.dirname(NEWS_FILE), { recursive: true });
  fs.writeFileSync(NEWS_FILE, JSON.stringify(posts, null, 2));
}

function newsSlug(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "news-post";
}

app.get(["/news", "/news.html"], (req, res) => {
  const posts = readNewsPosts()
    .filter(p => p.status === "published")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const cards = posts.map(post => `
    <article class="card news-card">
      ${post.image ? `<img src="${esc(post.image)}" alt="${esc(post.title)}">` : ""}
      <p class="meta">${esc(post.category || "News")} · ${esc(post.createdAt || "")}</p>
      <h3>${esc(post.title)}</h3>
      <p class="muted">${esc(post.summary || "")}</p>
      <a class="btn secondary" href="/news/${esc(post.slug)}">Read More</a>
    </article>
  `).join("");

  render(req, res, "News", `
    <main class="container">
      <section>
        <div class="section-head">
          <h1>FrozenThrone News</h1>
          <p>Updates from the FrozenThrone realm.</p>
        </div>
        <div class="grid grid-2">
          ${cards || `<div class="card"><h3>No news yet.</h3><p class="muted">Check back soon.</p></div>`}
        </div>
      </section>
    </main>
  `);
});

app.get("/news/:slug", (req, res) => {
  const post = readNewsPosts().find(p => p.slug === req.params.slug && p.status === "published");

  if (!post) {
    return render(req, res, "News", errorCard("News post not found."));
  }

  render(req, res, post.title, `
    <main class="container">
      <section>
        <article class="card">
          ${post.image ? `<img class="article-hero" src="${esc(post.image)}" alt="${esc(post.title)}">` : ""}
          <p class="meta">${esc(post.category || "News")} · ${esc(post.createdAt || "")}</p>
          <h1>${esc(post.title)}</h1>
          <p class="lead">${esc(post.summary || "")}</p>
          <div class="news-body">${post.body || ""}</div>
          <p><a class="btn secondary" href="/news">Back to News</a></p>
        </article>
      </section>
    </main>
  `);
});



app.get(["/register", "/register.html"], (req, res) => {
  render(req, res, "Register", `<main class="container"><section>
    <div class="section-head"><h1>Create Account</h1><p>Register a FrozenThrone game account.</p></div>
    <div class="card highlight form">
      <form method="POST" action="/register">
        <label for="username">Username</label><input id="username" name="username" placeholder="Username" maxlength="16" required>
        <label for="email">Email</label><input id="email" name="email" type="email" placeholder="you@example.com">
        <label for="password">Password</label><input id="password" name="password" type="password" placeholder="Password" required>
        <label for="confirm_password">Confirm Password</label><input id="confirm_password" name="confirm_password" type="password" placeholder="Confirm Password" required>
        <button class="btn" type="submit">Create Account</button>
      </form>
      <p class="muted center">Already have an account? <a href="/login">Login here</a>.</p>
    </div>
  </section></main>`);
});

app.post("/register", async (req, res) => {
  const username = String(req.body.username || "").trim().toUpperCase();
  const email = String(req.body.email || "").trim();
  const password = String(req.body.password || "");
  const confirm = String(req.body.confirm_password || "");

  if (!/^[A-Z0-9]{3,16}$/.test(username)) return render(req, res, "Register", errorCard("Username must be 3-16 letters or numbers."));
  if (password.length < 4) return render(req, res, "Register", errorCard("Password must be at least 4 characters."));
  if (password !== confirm) return render(req, res, "Register", errorCard("Passwords do not match."));

  try {
    const conn = await authDb();
    const [existing] = await conn.execute("SELECT id FROM account WHERE username = ?", [username]);
    if (existing.length > 0) {
      await conn.end();
      return render(req, res, "Register", errorCard("Account already exists."));
    }
    const { salt, verifier } = makeSrp6(username, password);
    await conn.execute(
      "INSERT INTO account (username, salt, verifier, email, reg_mail, expansion) VALUES (?, ?, ?, ?, ?, 2)",
      [username, salt, verifier, email, email]
    );
    const [rows] = await conn.execute("SELECT id, username FROM account WHERE username = ?", [username]);
    await conn.end();
    createSession(res, rows[0]);
    res.redirect("/account");
  } catch (err) {
    console.error(err);
    render(req, res, "Register", errorCard("Registration failed. Check server logs."));
  }
});

app.get("/login", (req, res) => {
  const next = esc(req.query.next || "/account");
  render(req, res, "Login", `<main class="container"><section>
    <div class="section-head"><h1>Account Login</h1><p>Login with your FrozenThrone game account.</p></div>
    <div class="card highlight form">
      <form method="POST" action="/login">
        <input type="hidden" name="next" value="${next}">
        <label for="username">Username</label><input id="username" name="username" placeholder="Username" required>
        <label for="password">Password</label><input id="password" name="password" type="password" placeholder="Password" required>
        <button class="btn" type="submit">Login</button>
      </form>
      <p class="muted center">Need an account? <a href="/register">Create one</a>.</p>
    </div>
  </section></main>`);
});

app.post("/login", async (req, res) => {
  const username = String(req.body.username || "").trim().toUpperCase();
  const password = String(req.body.password || "");
  const next = String(req.body.next || "/account");

  try {
    const conn = await authDb();
    const [rows] = await conn.execute("SELECT id, username, salt, verifier FROM account WHERE username = ?", [username]);
    await conn.end();
    if (!rows.length || !verifySrp6(username, password, rows[0].salt, rows[0].verifier)) {
      return render(req, res, "Login", errorCard("Invalid username or password."));
    }
    createSession(res, rows[0]);
    res.redirect(next.startsWith("/") ? next : "/account");
  } catch (err) {
    console.error(err);
    render(req, res, "Login", errorCard("Login failed. Check server logs."));
  }
});

app.get("/logout", (req, res) => {
  destroySession(req, res);
  res.redirect("/");
});

app.get("/account", requireLogin, async (req, res) => {
  try {
    const realmBlocks = [];
    for (const realm of realms) {
      if (!(await databaseExists(realm.db))) continue;
      const conn = await characterDb(realm.db);
      const [chars] = await conn.execute(
        `SELECT guid, name, race, class, level, money, online, totalKills FROM characters WHERE account = ? AND (deleteDate IS NULL OR deleteDate = 0) ORDER BY level DESC, name ASC`,
        [req.user.id]
      );
      await conn.end();
      realmBlocks.push(`<div class="card ${realm.public ? "highlight" : ""}"><h3>${esc(realm.name)} ${realm.public ? "" : "<span class='badge'>Beta</span>"}</h3>${chars.length ? `<div class="table-wrap"><table class="rank-table"><thead><tr><th>Name</th><th>Race</th><th>Class</th><th>Level</th><th>Gold</th><th>Status</th></tr></thead><tbody>${chars.map(c => `<tr><td>${esc(c.name)}</td><td>${raceName(c.race)}</td><td>${className(c.class)}</td><td>${c.level}</td><td>${moneyToGold(c.money)}</td><td>${c.online ? "Online" : "Offline"}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No characters on this realm yet.</p>`}</div>`);
    }
    render(req, res, "Account", `<main class="container"><section>
      <div class="section-head"><p class="eyebrow">Account Panel</p><h1>Welcome, ${esc(req.user.username)}</h1><p>Manage your account, view characters, and prepare for votes and shop rewards.</p></div>
      <div class="grid grid-3">
        <div class="card stat"><span>Account ID</span><strong>${req.user.id}</strong></div>
        <div class="card stat"><span>Vote Tokens</span><strong>Soon</strong></div>
        <div class="card stat"><span>Shop</span><strong>Locked</strong></div>
      </div>
      <div class="grid grid-2 account-grid">${realmBlocks.join("")}</div>
      <div class="card"><h3>Important Beta Notice</h3><p class="muted">Progress on FrozenThrone Beta does not transfer to the live FrozenThrone realm. Beta may be reset when testing requires it.</p></div>
    </section></main>`);
  } catch (err) {
    console.error(err);
    render(req, res, "Account", errorCard("Account panel failed. Check server logs."));
  }
});



require("./modules/armory/routes")(app, {
  render,
  errorCard,
  esc,
  realms,
  getRealm,
  databaseExists,
  characterDb,
  worldDb,
  raceName,
  className,
  moneyToGold,
  itemIconUrl,
  itemQualityName
});

async function requireGM(req, res, next) {
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);

  const level = await getUserSecurityLevel(req.user.id, -1);
  if (level < 3) {
    return render(req, res, "Access Denied", errorCard("GM access required."));
  }

  req.user.securityLevel = level;
  next();
}



app.get("/admin/bible", requireGM, async (req, res) => {
  const fs = require("fs");
  const path = require("path");

  const readSafe = file => {
    try { return fs.readFileSync(file, "utf8"); }
    catch { return "File not found."; }
  };

  const projectText = readSafe(path.join(__dirname, "docs/PROJECT.md"));
  const bibleText = readSafe(path.join(__dirname, "docs/BIBLE.md"));

  const latestBackup = (() => {
    try {
      return fs.readdirSync("/var/www/backups")
        .filter(f => f.includes("frozenthrone-code"))
        .sort()
        .reverse()[0] || "No code backup found.";
    } catch {
      return "Backup folder not readable.";
    }
  })();

  render(req, res, "Project Bible", `
    <main class="container">
      <section>
        <div class="section-head">
          <p class="eyebrow">FrozenThrone OS</p>
          <h1>📖 Project Bible</h1>
          <p>Admin-only project memory, milestones, backups, and next steps.</p>
        </div>

        <div class="grid grid-4">
          <div class="card stat"><span>Website</span><strong>Online</strong></div>
          <div class="card stat"><span>Renderer</span><strong>Live 3D Started</strong></div>
          <div class="card stat"><span>Latest Backup</span><strong>${esc(latestBackup)}</strong></div>
          <div class="card stat"><span>Default Backup</span><strong>Code Only</strong></div>
        </div>

        <div class="card">
          <div class="bible-tabs">
            <button class="btn bible-tab active" data-tab="overview">Overview</button>
            <button class="btn secondary bible-tab" data-tab="next">Next Session</button>
            <button class="btn secondary bible-tab" data-tab="milestone">Milestone</button>
            <button class="btn secondary bible-tab" data-tab="project">PROJECT.md</button>
            <button class="btn secondary bible-tab" data-tab="bible">BIBLE.md</button>
          </div>
        </div>

        <div class="card bible-panel active" id="bible-overview">
          <h3>Project Status</h3>
          <div class="bible-progress"><span style="width:95%"></span></div>
          <p><strong>Website:</strong> 95%</p>
          <div class="bible-progress"><span style="width:90%"></span></div>
          <p><strong>Armory:</strong> 90%</p>
          <div class="bible-progress"><span style="width:80%"></span></div>
          <p><strong>3D Renderer:</strong> 80%</p>
          <div class="bible-progress"><span style="width:92%"></span></div>
          <p><strong>Overall:</strong> 92%</p>
        </div>

        <div class="card bible-panel" id="bible-next">
          <h3>Next Session</h3>
          <ul class="bible-checklist">
            <li>☐ Fix gender mapping in wow-model-viewer export.</li>
            <li>☐ Fix equipment slot mapping.</li>
            <li>☐ Verify shoulders, chest, legs, boots, cloak, weapons.</li>
            <li>☐ Embed live 3D viewer into character Armory page.</li>
            <li>☐ Remove placeholder silhouette after viewer is stable.</li>
            <li>☐ Keep backups code-only unless full backup is requested.</li>
          </ul>
        </div>

        <div class="card bible-panel" id="bible-milestone">
          <h3>Major Milestone</h3>
          <p><strong>First live 3D character rendered from TrinityCore data.</strong></p>
          <p class="muted">Pipeline proven: character DB → manifest → display IDs → wow-model-viewer → interactive browser model.</p>
          <p><strong>Character:</strong> Randymarsh</p>
          <p><strong>Status:</strong> Viewer works. Helmet renders. Gear mapping needs correction.</p>
        </div>

        <div class="card bible-panel" id="bible-project">
          <h3>PROJECT.md</h3>
          <pre class="bible-text">${esc(projectText)}</pre>
        </div>

        <div class="card bible-panel" id="bible-bible">
          <h3>BIBLE.md</h3>
          <pre class="bible-text">${esc(bibleText)}</pre>
        </div>
      </section>
    </main>

    <script>
      document.querySelectorAll(".bible-tab").forEach(btn => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".bible-tab").forEach(b => {
            b.classList.remove("active");
            b.classList.add("secondary");
          });
          btn.classList.add("active");
          btn.classList.remove("secondary");

          document.querySelectorAll(".bible-panel").forEach(p => p.classList.remove("active"));
          document.getElementById("bible-" + btn.dataset.tab).classList.add("active");
        });
      });
    </script>
  `);
});



app.get("/admin/news", requireGM, async (req, res) => {
  const posts = readNewsPosts().sort((a, b) => Number(b.id) - Number(a.id));

  const rows = posts.map(post => `
    <tr>
      <td>${esc(post.id)}</td>
      <td><a href="/admin/news/${post.id}/edit"><strong>${esc(post.title)}</strong></a></td>
      <td>${esc(post.status)}</td>
      <td>${esc(post.category || "")}</td>
      <td>${esc(post.createdAt || "")}</td>
      <td><a class="btn secondary" href="/admin/news/${post.id}/edit">Edit</a></td>
    </tr>
  `).join("");

  render(req, res, "News Manager", `
    <main class="container admin-control">
      <section>
        <div class="section-head">
          <p class="eyebrow">FrozenThrone CMS</p>
          <h1>News Manager</h1>
          <p>Create and edit public news posts without touching HTML files.</p>
        </div>

        <div class="card highlight">
          <a class="btn" href="/admin/news/new">+ New News Post</a>
          <a class="btn secondary" href="/admin">Back to Admin</a>
          <a class="btn secondary" href="/news">View Public News</a>
        </div>

        <div class="card">
          <h3>Posts</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Category</th><th>Date</th><th>Edit</th></tr></thead>
              <tbody>${rows || `<tr><td colspan="6">No posts yet.</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  `);
});

app.get(["/admin/news/new", "/admin/news/:id/edit"], requireGM, async (req, res) => {
  const posts = readNewsPosts();
  const post = req.params.id
    ? posts.find(p => Number(p.id) === Number(req.params.id))
    : {
        id: "",
        title: "",
        slug: "",
        summary: "",
        body: "",
        status: "draft",
        category: "Announcements",
        image: "/images/frozenthrone-bg.jpeg",
        createdAt: new Date().toISOString().slice(0, 10)
      };

  if (!post) return render(req, res, "News Manager", errorCard("News post not found."));

  render(req, res, "News Editor", `
    <main class="container admin-control">
      <section>
        <div class="section-head">
          <p class="eyebrow">FrozenThrone CMS</p>
          <h1>${post.id ? "Edit News Post" : "New News Post"}</h1>
          <p>Simple editor first. WYSIWYG comes after this saves clean.</p>
        </div>

        <div class="card highlight">
          <form method="POST" action="/admin/news/save">
            <input type="hidden" name="id" value="${esc(post.id)}">

            <label>Title</label>
            <input name="title" value="${esc(post.title)}" required>

            <label>Slug</label>
            <input name="slug" value="${esc(post.slug)}" placeholder="beta-realm-is-online">

            <label>Summary</label>
            <input name="summary" value="${esc(post.summary || "")}">

            <label>Category</label>
            <input name="category" value="${esc(post.category || "Announcements")}">

            <label>Featured Image URL</label>
            <input name="image" value="${esc(post.image || "")}" placeholder="/images/frozenthrone-bg.jpeg">

            <label>Status</label>
            <select name="status">
              <option value="draft" ${post.status === "draft" ? "selected" : ""}>Draft</option>
              <option value="published" ${post.status === "published" ? "selected" : ""}>Published</option>
            </select>

            <label>Date</label>
            <input name="createdAt" value="${esc(post.createdAt || "")}" placeholder="2026-07-05">

            <label>Body HTML</label>
            <textarea name="body" rows="14">${esc(post.body || "")}</textarea>

            <button class="btn" type="submit">Save News Post</button>
            <a class="btn secondary" href="/admin/news">Cancel</a>
          </form>
        </div>
      </section>
    </main>
  `);
});

app.post("/admin/news/save", requireGM, async (req, res) => {
  const posts = readNewsPosts();
  const id = Number(req.body.id);
  const nextId = posts.length ? Math.max(...posts.map(p => Number(p.id) || 0)) + 1 : 1;

  const post = {
    id: id || nextId,
    title: String(req.body.title || "Untitled").trim(),
    slug: newsSlug(req.body.slug || req.body.title),
    summary: String(req.body.summary || "").trim(),
    body: String(req.body.body || "").trim(),
    status: req.body.status === "published" ? "published" : "draft",
    category: String(req.body.category || "Announcements").trim(),
    image: String(req.body.image || "").trim(),
    createdAt: String(req.body.createdAt || new Date().toISOString().slice(0, 10)).trim()
  };

  const idx = posts.findIndex(p => Number(p.id) === post.id);
  if (idx >= 0) posts[idx] = post;
  else posts.push(post);

  writeNewsPosts(posts);
  res.redirect("/admin/news");
});



app.get("/admin", requireGM, async (req, res) => {
  try {
    const activeRealm = await getActiveRealm(req);
    const allRealms = await loadRealmConfigs();

    const authConn = await authDb();
    const activeCharConn = await characterDb(activeRealm.characters_db);

    const [accounts] = await authConn.execute("SELECT COUNT(*) AS total FROM account");
    const [activeChars] = await activeCharConn.execute("SELECT COUNT(*) AS total FROM characters WHERE deleteDate IS NULL OR deleteDate = 0");
    const [online] = await activeCharConn.execute("SELECT guid, name, level, race, class FROM characters WHERE online = 1 ORDER BY level DESC, name ASC LIMIT 12");

    await authConn.end();
    await activeCharConn.end();

    const onlineRows = online.map(c => `
      <tr>
        <td><a href="/admin/player/${activeRealm.realm_key}/${c.guid}"><strong>${esc(c.name)}</strong></a></td>
        <td>${esc(c.level)}</td>
        <td>${esc(raceName(c.race))}</td>
        <td>${esc(className(c.class))}</td>
      </tr>
    `).join("");

    const card = (title, text, href, emoji) => `
      <a class="card admin-card" href="${href}">
        <h3>${emoji} ${title}</h3>
        <p class="muted">${text}</p>
      </a>
    `;

    const realmLinks = allRealms.map(r => {
      const active = r.realm_key === activeRealm.realm_key;
      const icon = Number(r.is_production) === 1 ? "🟢" : "🟠";
      return `<a class="btn ${active ? "" : "secondary"}" href="/admin/realm/switch?realm=${esc(r.realm_key)}&next=/admin">${icon} ${esc(r.display_name)}</a>`;
    }).join(" ");

    render(req, res, "FrozenThrone Control Center", `
      <main class="container admin-control">
        <section>
          <div class="section-head">
            <p class="eyebrow">FrozenThrone GM Console</p>
            <h1>Control Center</h1>
            <p>Manage players, items, NPCs, quests, mail, vendors, logs, and daily GM work from one place.</p>
          </div>

          ${realmBadge(activeRealm)}

          <div class="grid grid-4">
            <div class="card stat"><span>Active Realm</span><strong>${esc(activeRealm.display_name)}</strong></div>
            <div class="card stat"><span>Accounts</span><strong>${esc(accounts[0].total)}</strong></div>
            <div class="card stat"><span>Characters</span><strong>${esc(activeChars[0].total)}</strong></div>
            <div class="card stat"><span>Online Now</span><strong>${esc(online.length)}</strong></div>
          </div>

          <div class="card highlight">
            <h3>Realm Switcher</h3>
            <p class="muted">Choose which realm the admin tools read from.</p>
            <div class="admin-actions">${realmLinks}</div>
          </div>

          <div class="card highlight">
            <h3>GM Quick Search</h3>
            <p class="muted">Fast entry points for daily server work.</p>

            <div class="grid grid-4">
              <form method="GET" action="/admin">
                <label>Player</label>
                <input name="q" placeholder="Frozen, Noodle, Ghostmaker">
                <button class="btn" type="submit">Search</button>
              </form>

              <form method="GET" action="/admin">
                <label>Item</label>
                <input name="item" placeholder="900001 or Shadowmourne">
                <button class="btn" type="submit">Search</button>
              </form>

              <form method="GET" action="/admin/npcs">
                <label>NPC</label>
                <input name="q" placeholder="900100, Teleporter, Lich King">
                <button class="btn" type="submit">Search</button>
              </form>

              <form method="GET" action="/admin/quests">
                <label>Quest</label>
                <input name="q" placeholder="Quest ID or title">
                <button class="btn" type="submit">Search</button>
              </form>
            </div>
          </div>

          <div class="grid grid-3">
            ${card("Players", "Inspect characters, inventory, account data, gear, and online status.", "/admin", "👥")}
            ${card("Items", "Inspect item stats, owners, vendors, drops, and GM commands.", "/admin?item=Shadowmourne", "🎒")}
            ${card("NPCs", "Inspect NPC templates, loot, vendors, quests, and spawn data.", "/admin/npcs", "🧙")}
            ${card("Quests", "Inspect quest starters, enders, objectives, rewards, and chains.", "/admin/quests", "📜")}
            ${card("Mail", "Send in-game mail, gold, items, and player rewards.", "/admin/mail", "📬")}
            ${card("Vendor Tools", "Open an NPC and manage its vendor inventory.", "/admin/npcs", "🛒")}
            ${card("Accounts", "Inspect accounts, GM access, and all characters.", "/admin/account/1", "👤")}
            ${card("Public Armory", "Preview the public-facing character and database pages.", "/armory", "⚔️")}
            ${card("News CMS", "Create and publish realm news posts.", "/admin/news", "📰")}
            ${card("Logs", "Review GM actions, mail sends, vendor edits, and changes.", "/admin/logs", "📋")}
          </div>

          <div class="card">
            <h3>Online Players — ${esc(activeRealm.display_name)}</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Name</th><th>Level</th><th>Race</th><th>Class</th></tr></thead>
                <tbody>${onlineRows || `<tr><td colspan="4">No players online.</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error("admin failed", err);
    render(req, res, "Admin Error", errorCard("Admin panel failed. Check logs."));
  }
});



app.get("/admin/player/:realm/:guid", requireGM, async (req, res) => {
  const realm = realms.find((r) => r.key === req.params.realm);
  const guid = Number(req.params.guid);

  if (!realm || !Number.isInteger(guid) || guid <= 0) {
    return render(req, res, "Player Inspector", errorCard("Invalid player inspector request."));
  }

  try {
    const charConn = await characterDb(realm.db);
    const authConn = await authDb();
    const worldConn = await worldDb();

    const [chars] = await charConn.execute(
      `SELECT *
       FROM characters
       WHERE guid = ? AND (deleteDate IS NULL OR deleteDate = 0)
       LIMIT 1`,
      [guid]
    );

    if (!chars.length) {
      await charConn.end();
      await authConn.end();
      await worldConn.end();
      return render(req, res, "Player Inspector", errorCard("Character not found."));
    }

    const ch = chars[0];

    const [accounts] = await authConn.execute(
      "SELECT * FROM account WHERE id = ? LIMIT 1",
      [ch.account]
    );
    const acct = accounts[0] || {};

    const [gmAccess] = await authConn.execute(
      "SELECT SecurityLevel, RealmID, Comment FROM account_access WHERE AccountID = ? ORDER BY SecurityLevel DESC",
      [ch.account]
    );

    const [accountChars] = await charConn.execute(
      `SELECT guid, name, race, class, level, money, online, totalKills
       FROM characters
       WHERE account = ? AND (deleteDate IS NULL OR deleteDate = 0)
       ORDER BY level DESC, name ASC`,
      [ch.account]
    );

    const [inventory] = await charConn.execute(
      `SELECT ci.bag, ci.slot, ci.item AS itemGuid, ii.itemEntry, ii.count, ii.durability
       FROM character_inventory ci
       JOIN item_instance ii ON ii.guid = ci.item
       WHERE ci.guid = ?
       ORDER BY ci.bag ASC, ci.slot ASC
       LIMIT 300`,
      [guid]
    );

    const entries = [...new Set(inventory.map((i) => i.itemEntry).filter(Boolean))];
    let templates = new Map();

    if (entries.length) {
      const placeholders = entries.map(() => "?").join(",");
      const [items] = await worldConn.execute(
        `SELECT entry, name, Quality, ItemLevel, displayid
         FROM item_template
         WHERE entry IN (${placeholders})`,
        entries
      );
      templates = new Map(items.map((i) => [Number(i.entry), i]));
    }

    await charConn.end();
    await authConn.end();
    await worldConn.end();

    const accountRows = Object.entries(acct)
      .filter(([k]) => !["sha_pass_hash", "salt", "verifier", "sessionkey", "v", "s"].includes(k))
      .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v ?? "")}</td></tr>`)
      .join("");

    const gmRows = gmAccess.map((g) => `
      <tr>
        <td>${esc(g.SecurityLevel)}</td>
        <td>${esc(g.RealmID)}</td>
        <td>${esc(g.Comment || "")}</td>
      </tr>
    `).join("");

    const altRows = accountChars.map((c) => `
      <tr>
        <td><a href="/admin/player/${realm.key}/${c.guid}">${esc(c.name)}</a></td>
        <td><a href="/armory/${realm.key}/${c.guid}">Armory</a></td>
        <td>${esc(c.guid)}</td>
        <td>${esc(raceName(c.race))}</td>
        <td>${esc(className(c.class))}</td>
        <td>${esc(c.level)}</td>
        <td>${moneyToGold(c.money)}</td>
        <td>${c.online ? "Online" : "Offline"}</td>
      </tr>
    `).join("");

    const invRows = inventory.map((i) => {
      const tpl = templates.get(Number(i.itemEntry)) || {};
      return `
        <tr>
          <td>${esc(i.bag)}</td>
          <td>${esc(i.slot)}</td>
          <td><img class="item-icon" src="${itemIconUrl(tpl.displayid)}" alt=""> <strong>${esc(tpl.name || "Unknown Item")}</strong></td>
          <td>${esc(i.itemEntry)}</td>
          <td>${esc(i.itemGuid)}</td>
          <td>${esc(i.count)}</td>
          <td>${esc(i.durability)}</td>
          <td>${esc(itemQualityName(tpl.Quality))}</td>
        </tr>
      `;
    }).join("");

    render(req, res, `${ch.name} Inspector`, `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">GM Player Inspector · ${esc(realm.name)}</p>
            <h1>${esc(ch.name)}</h1>
            <p>${esc(raceName(ch.race))} ${esc(className(ch.class))} · Level ${esc(ch.level)} · ${ch.online ? "Online" : "Offline"}</p>
          </div>

          <div class="grid grid-4">
            <div class="card stat"><span>Character GUID</span><strong>${esc(ch.guid)}</strong></div>
            <div class="card stat"><span>Account ID</span><strong>${esc(ch.account)}</strong></div>
            <div class="card stat"><span>Gold</span><strong>${moneyToGold(ch.money)}</strong></div>
            <div class="card stat"><span>Total Kills</span><strong>${esc(ch.totalKills)}</strong></div>
          </div>

          <div class="grid grid-2">
            <div class="card">
              <h3>Quick Actions</h3>
              <p class="muted">Read-only for now. Action buttons come after logging is built.</p>
              <a class="btn secondary" href="/armory/${realm.key}/${ch.guid}">View Public Armory</a>
              <a class="btn secondary" href="/admin/npc/${npc.entry}/vendor">Edit Vendor</a>
              <a class="btn secondary" href="/admin">Back to Admin</a>
            </div>

            <div class="card highlight">
              <h3>GM Location Data</h3>
              <p class="muted">Not public. Use in-game <code>.appear ${esc(ch.name)}</code> when needed.</p>
              <div class="grid grid-3">
                <div class="stat"><span>Map</span><strong>${esc(ch.map)}</strong></div>
                <div class="stat"><span>Zone</span><strong>${esc(ch.zone)}</strong></div>
                <div class="stat"><span>Online</span><strong>${ch.online ? "Yes" : "No"}</strong></div>
              </div>
              <p class="muted">X ${esc(Number(ch.position_x).toFixed(2))} · Y ${esc(Number(ch.position_y).toFixed(2))} · Z ${esc(Number(ch.position_z).toFixed(2))}</p>
            </div>
          </div>

          <div class="card">
            <h3>Account Data</h3>
            <div class="table-wrap">
              <table class="data-table">
                <tbody>${accountRows || `<tr><td>No account data found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <h3>GM Access</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Security</th><th>RealmID</th><th>Comment</th></tr></thead>
                <tbody>${gmRows || `<tr><td colspan="3">Normal player account.</td></tr>`}</tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <h3>Characters On This Account</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Name</th><th>Armory</th><th>GUID</th><th>Race</th><th>Class</th><th>Level</th><th>Gold</th><th>Status</th></tr></thead>
                <tbody>${altRows || `<tr><td colspan="8">No characters found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <h3>Inventory Snapshot</h3>
            <p class="muted">Shows equipped gear, bags, and carried inventory for this character.</p>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Bag</th><th>Slot</th><th>Item</th><th>Entry ID</th><th>Item GUID</th><th>Count</th><th>Durability</th><th>Quality</th></tr></thead>
                <tbody>${invRows || `<tr><td colspan="8">No inventory found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error("player inspector failed", err);
    render(req, res, "Player Inspector Error", errorCard("Player inspector failed. Check logs."));
  }
});


app.get("/admin/item/:entry", requireGM, async (req, res) => {
  const entry = Number(req.params.entry);
  if (!Number.isInteger(entry) || entry <= 0) {
    return render(req, res, "Item Database", errorCard("Invalid item entry ID."));
  }

  try {
    const worldConn = await worldDb();
    const mainConn = await characterDb("characters");
    const betaConn = await characterDb("characters_beta");

    const [items] = await worldConn.execute(
      `SELECT *
       FROM item_template
       WHERE entry = ?
       LIMIT 1`,
      [entry]
    );

    if (!items.length) {
      await worldConn.end();
      await mainConn.end();
      await betaConn.end();
      return render(req, res, "Item Database", errorCard("Item not found."));
    }

    const item = items[0];

    const [mainOwners] = await mainConn.execute(
      `SELECT c.guid, c.name, c.account, c.level, c.race, c.class, ci.bag, ci.slot, ii.guid AS itemGuid, ii.count
       FROM item_instance ii
       JOIN character_inventory ci ON ci.item = ii.guid
       JOIN characters c ON c.guid = ci.guid
       WHERE ii.itemEntry = ? AND (c.deleteDate IS NULL OR c.deleteDate = 0)
       ORDER BY c.name ASC
       LIMIT 100`,
      [entry]
    );

    const [betaOwners] = await betaConn.execute(
      `SELECT c.guid, c.name, c.account, c.level, c.race, c.class, ci.bag, ci.slot, ii.guid AS itemGuid, ii.count
       FROM item_instance ii
       JOIN character_inventory ci ON ci.item = ii.guid
       JOIN characters c ON c.guid = ci.guid
       WHERE ii.itemEntry = ? AND (c.deleteDate IS NULL OR c.deleteDate = 0)
       ORDER BY c.name ASC
       LIMIT 100`,
      [entry]
    );

    const [mainCopies] = await mainConn.execute(
      "SELECT COALESCE(SUM(count), 0) AS total FROM item_instance WHERE itemEntry = ?",
      [entry]
    );

    const [betaCopies] = await betaConn.execute(
      "SELECT COALESCE(SUM(count), 0) AS total FROM item_instance WHERE itemEntry = ?",
      [entry]
    );

    const [vendors] = await worldConn.execute(
      `SELECT nv.entry AS vendorEntry, ct.name AS vendorName, ct.subname, nv.slot, nv.maxcount, nv.incrtime, nv.ExtendedCost
       FROM npc_vendor nv
       LEFT JOIN creature_template ct ON ct.entry = nv.entry
       WHERE nv.item = ?
       ORDER BY ct.name ASC, nv.entry ASC
       LIMIT 100`,
      [entry]
    );

    const [drops] = await worldConn.execute(
      `SELECT clt.Entry AS lootEntry, clt.Chance, clt.MinCount, clt.MaxCount, clt.QuestRequired, clt.Comment,
              ct.entry AS creatureEntry, ct.name AS creatureName, ct.minlevel, ct.maxlevel, ct.rank
       FROM creature_loot_template clt
       LEFT JOIN creature_template ct ON ct.lootid = clt.Entry
       WHERE clt.Item = ?
       ORDER BY clt.Chance DESC, ct.name ASC
       LIMIT 100`,
      [entry]
    );

    await worldConn.end();
    await mainConn.end();
    await betaConn.end();

    const statRows = Array.from({ length: 10 }, (_, idx) => {
      const n = idx + 1;
      const type = item[`stat_type${n}`];
      const value = item[`stat_value${n}`];
      if (!type || !value) return "";
      return `<tr><td>Stat ${n}</td><td>${esc(type)}</td><td>${esc(value)}</td></tr>`;
    }).join("");

    const spellRows = Array.from({ length: 5 }, (_, idx) => {
      const n = idx + 1;
      const spell = item[`spellid_${n}`];
      const trigger = item[`spelltrigger_${n}`];
      const charges = item[`spellcharges_${n}`];
      const cooldown = item[`spellcooldown_${n}`];
      if (!spell) return "";
      return `<tr><td>${n}</td><td>${esc(spell)}</td><td>${esc(trigger)}</td><td>${esc(charges)}</td><td>${esc(cooldown)}</td></tr>`;
    }).join("");

    const ownerRows = (realmKey, rows) => rows.map(o => `
      <tr>
        <td>${realmKey === "main" ? "FrozenThrone" : "Beta"}</td>
        <td><a href="/admin/player/${realmKey}/${o.guid}">${esc(o.name)}</a></td>
        <td>${esc(o.guid)}</td>
        <td><a href="/admin/account/${o.account}">${esc(o.account)}</a></td>
        <td>${esc(o.level)}</td>
        <td>${esc(raceName(o.race))}</td>
        <td>${esc(className(o.class))}</td>
        <td>${esc(o.bag)}</td>
        <td>${esc(o.slot)}</td>
        <td>${esc(o.itemGuid)}</td>
        <td>${esc(o.count)}</td>
      </tr>
    `).join("");

    const vendorRows = vendors.map(v => `
      <tr>
        <td>${esc(v.vendorName || "Unknown Vendor")}</td>
        <td>${esc(v.vendorEntry)}</td>
        <td>${esc(v.subname || "")}</td>
        <td>${esc(v.slot)}</td>
        <td>${esc(v.maxcount)}</td>
        <td>${esc(v.incrtime)}</td>
        <td>${esc(v.ExtendedCost)}</td>
      </tr>
    `).join("");

    const dropRows = drops.map(d => `
      <tr>
        <td>${esc(d.creatureName || "Unknown / Reference Loot")}</td>
        <td>${esc(d.creatureEntry || d.lootEntry)}</td>
        <td>${esc(d.lootEntry)}</td>
        <td>${esc(d.Chance)}%</td>
        <td>${esc(d.MinCount)} - ${esc(d.MaxCount)}</td>
        <td>${d.QuestRequired ? "Yes" : "No"}</td>
        <td>${esc(d.Comment || "")}</td>
      </tr>
    `).join("");

    const isCustomItem = Number(item.entry) >= 900000;

    render(req, res, `${item.name} Item Database`, `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">GM Item Database</p>
            <h1><img class="item-icon" src="${itemIconUrl(item.displayid)}" alt=""> ${esc(item.name)}</h1>
            <p>Entry ID ${esc(item.entry)} · ${esc(itemQualityName(item.Quality))} · Item Level ${esc(item.ItemLevel)} ${isCustomItem ? "· <span class='badge'>FrozenThrone Custom</span>" : ""}</p>
            <button class="btn secondary" type="button" onclick="copyAdminText('.additem ${esc(item.entry)}')">Copy .additem Command</button>
          </div>

          <div class="grid grid-4">
            <div class="card stat"><span>Entry ID</span><strong>${esc(item.entry)}</strong></div>
            <div class="card stat"><span>Display ID</span><strong>${esc(item.displayid)}</strong></div>
            <div class="card stat"><span>Item Level</span><strong>${esc(item.ItemLevel)}</strong></div>
            <div class="card stat"><span>Required Level</span><strong>${esc(item.RequiredLevel)}</strong></div>
            <div class="card stat"><span>Main Copies</span><strong>${esc(mainCopies[0].total)}</strong></div>
            <div class="card stat"><span>Beta Copies</span><strong>${esc(betaCopies[0].total)}</strong></div>
          </div>

          <div class="grid grid-2">
            <div class="card">
              <h3>Core Info</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <tbody>
                    <tr><td>Class</td><td>${esc(item.class)}</td></tr>
                    <tr><td>Subclass</td><td>${esc(item.subclass)}</td></tr>
                    <tr><td>Inventory Type</td><td>${esc(item.InventoryType)}</td></tr>
                    <tr><td>Quality</td><td>${esc(itemQualityName(item.Quality))}</td></tr>
                    <tr><td>Buy Price</td><td>${esc(item.BuyPrice)}</td></tr>
                    <tr><td>Sell Price</td><td>${esc(item.SellPrice)}</td></tr>
                    <tr><td>Stackable</td><td>${esc(item.stackable)}</td></tr>
                    <tr><td>Container Slots</td><td>${esc(item.ContainerSlots)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <h3>Combat Info</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <tbody>
                    <tr><td>Damage 1</td><td>${esc(item.dmg_min1)} - ${esc(item.dmg_max1)}</td></tr>
                    <tr><td>Damage Type 1</td><td>${esc(item.dmg_type1)}</td></tr>
                    <tr><td>Damage 2</td><td>${esc(item.dmg_min2)} - ${esc(item.dmg_max2)}</td></tr>
                    <tr><td>Armor</td><td>${esc(item.armor)}</td></tr>
                    <tr><td>Delay</td><td>${esc(item.delay)}</td></tr>
                    <tr><td>Holy Res</td><td>${esc(item.holy_res)}</td></tr>
                    <tr><td>Fire Res</td><td>${esc(item.fire_res)}</td></tr>
                    <tr><td>Frost Res</td><td>${esc(item.frost_res)}</td></tr>
                    <tr><td>Shadow Res</td><td>${esc(item.shadow_res)}</td></tr>
                    <tr><td>Arcane Res</td><td>${esc(item.arcane_res)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="grid grid-2">
            <div class="card">
              <h3>Stats</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>Slot</th><th>Stat Type</th><th>Value</th></tr></thead>
                  <tbody>${statRows || `<tr><td colspan="3">No stats.</td></tr>`}</tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <h3>Spell Effects</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>#</th><th>Spell ID</th><th>Trigger</th><th>Charges</th><th>Cooldown</th></tr></thead>
                  <tbody>${spellRows || `<tr><td colspan="5">No spell effects.</td></tr>`}</tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="grid grid-2">
            <div class="card">
              <h3>NPC Vendors</h3>
              <p class="muted">NPCs that sell this item from npc_vendor.</p>
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>Vendor</th><th>Entry</th><th>Subname</th><th>Slot</th><th>Max</th><th>Restock</th><th>Ext Cost</th></tr></thead>
                  <tbody>${vendorRows || `<tr><td colspan="7">No vendors found.</td></tr>`}</tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <h3>Creature Drops</h3>
              <p class="muted">Creatures/loot entries that drop this item.</p>
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>Creature</th><th>Creature Entry</th><th>Loot ID</th><th>Chance</th><th>Count</th><th>Quest</th><th>Comment</th></tr></thead>
                  <tbody>${dropRows || `<tr><td colspan="7">No creature drops found.</td></tr>`}</tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="card">
            <h3>Owners</h3>
            <p class="muted">Shows who currently has this item in equipped gear or inventory.</p>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Realm</th><th>Character</th><th>GUID</th><th>Account</th><th>Level</th><th>Race</th><th>Class</th><th>Bag</th><th>Slot</th><th>Item GUID</th><th>Count</th></tr></thead>
                <tbody>${ownerRows("main", mainOwners) + ownerRows("beta", betaOwners) || `<tr><td colspan="11">No owners found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <a class="btn secondary" href="/admin">Back to Admin</a>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error("item database failed", err);
    render(req, res, "Item Database Error", errorCard("Item database page failed. Check logs."));
  }
});


app.get("/admin/account/:id", requireGM, async (req, res) => {
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return render(req, res, "Account Inspector", errorCard("Invalid account ID."));
  }

  try {
    const authConn = await authDb();
    const mainConn = await characterDb("characters");
    const betaConn = await characterDb("characters_beta");

    const [accounts] = await authConn.execute(
      "SELECT id, username, email, reg_mail, joindate, last_ip, last_attempt_ip, failed_logins, locked, online, expansion FROM account WHERE id = ? LIMIT 1",
      [accountId]
    );

    if (!accounts.length) {
      await authConn.end();
      await mainConn.end();
      await betaConn.end();
      return render(req, res, "Account Inspector", errorCard("Account not found."));
    }

    const acct = accounts[0];

    const [access] = await authConn.execute(
      "SELECT SecurityLevel, RealmID, Comment FROM account_access WHERE AccountID = ? ORDER BY SecurityLevel DESC",
      [accountId]
    );

    const [mainChars] = await mainConn.execute(
      `SELECT guid, name, race, class, level, money, online, totalKills, totaltime, logout_time
       FROM characters
       WHERE account = ? AND (deleteDate IS NULL OR deleteDate = 0)
       ORDER BY level DESC, name ASC`,
      [accountId]
    );

    const [betaChars] = await betaConn.execute(
      `SELECT guid, name, race, class, level, money, online, totalKills, totaltime, logout_time
       FROM characters
       WHERE account = ? AND (deleteDate IS NULL OR deleteDate = 0)
       ORDER BY level DESC, name ASC`,
      [accountId]
    );

    await authConn.end();
    await mainConn.end();
    await betaConn.end();

    const maxGM = access.length ? Math.max(...access.map(a => Number(a.SecurityLevel || 0))) : 0;

    const accessRows = access.map(a => `
      <tr>
        <td>${esc(a.SecurityLevel)}</td>
        <td>${esc(a.RealmID)}</td>
        <td>${esc(a.Comment || "")}</td>
      </tr>
    `).join("");

    const charRows = (realmKey, rows) => rows.map(c => `
      <tr>
        <td>${realmKey === "main" ? "FrozenThrone" : "Beta"}</td>
        <td><a href="/admin/player/${realmKey}/${c.guid}">${esc(c.name)}</a></td>
        <td><a href="/armory/${realmKey}/${c.guid}">Armory</a></td>
        <td>${esc(c.guid)}</td>
        <td>${esc(raceName(c.race))}</td>
        <td>${esc(className(c.class))}</td>
        <td>${esc(c.level)}</td>
        <td>${moneyToGold(c.money)}</td>
        <td>${c.online ? "Online" : "Offline"}</td>
        <td>${esc(c.totalKills)}</td>
      </tr>
    `).join("");

    render(req, res, `${acct.username} Account Inspector`, `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">GM Account Inspector</p>
            <h1>${esc(acct.username)}</h1>
            <p>Account ID ${esc(acct.id)} · GM Level ${esc(maxGM)}</p>
          </div>

          <div class="grid grid-4">
            <div class="card stat"><span>Account ID</span><strong>${esc(acct.id)}</strong></div>
            <div class="card stat"><span>GM Level</span><strong>${esc(maxGM)}</strong></div>
            <div class="card stat"><span>Main Characters</span><strong>${esc(mainChars.length)}</strong></div>
            <div class="card stat"><span>Beta Characters</span><strong>${esc(betaChars.length)}</strong></div>
          </div>

          <div class="grid grid-2">
            <div class="card">
              <h3>Account Details</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <tbody>
                    <tr><td>Username</td><td>${esc(acct.username)}</td></tr>
                    <tr><td>Email</td><td>${esc(acct.email || "")}</td></tr>
                    <tr><td>Registered Email</td><td>${esc(acct.reg_mail || "")}</td></tr>
                    <tr><td>Join Date</td><td>${esc(acct.joindate || "")}</td></tr>
                    <tr><td>Last IP</td><td>${esc(acct.last_ip || "")}</td></tr>
                    <tr><td>Last Attempt IP</td><td>${esc(acct.last_attempt_ip || "")}</td></tr>
                    <tr><td>Failed Logins</td><td>${esc(acct.failed_logins)}</td></tr>
                    <tr><td>Locked</td><td>${esc(acct.locked)}</td></tr>
                    <tr><td>Online</td><td>${esc(acct.online)}</td></tr>
                    <tr><td>Expansion</td><td>${esc(acct.expansion)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <h3>GM Access</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>Security</th><th>RealmID</th><th>Comment</th></tr></thead>
                  <tbody>${accessRows || `<tr><td colspan="3">Normal player account.</td></tr>`}</tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="card">
            <h3>Characters On Account</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Realm</th><th>Name</th><th>Armory</th><th>GUID</th><th>Race</th><th>Class</th><th>Level</th><th>Gold</th><th>Status</th><th>Kills</th></tr></thead>
                <tbody>${charRows("main", mainChars) + charRows("beta", betaChars) || `<tr><td colspan="10">No characters found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <a class="btn secondary" href="/admin">Back to Admin</a>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error("account inspector failed", err);
    render(req, res, "Account Inspector Error", errorCard("Account inspector failed. Check logs."));
  }
});


app.get("/admin/mail", requireGM, async (req, res) => {
  render(req, res, "GM Mail Tool", `
    <main class="container">
      <section>
        <div class="section-head">
          <p class="eyebrow">GM Mail Tool</p>
          <h1>Send Item Mail</h1>
          <p>First write tool. Sends one item to one character and logs the action.</p>
        </div>

        <div class="card">
          <form method="POST" action="/admin/mail">
            <label>Realm</label>
            <select name="realm">
              <option value="main">FrozenThrone</option>
              <option value="beta">FrozenThrone Beta</option>
            </select>

            <label>Character Name</label>
            <input name="character" placeholder="Frozen" required>

            <label>Item Entry ID</label>
            <input name="itemEntry" placeholder="900001 (optional)">

            <label>Quantity</label>
            <input name="quantity" value="1">

            <label>Money Attached</label>
            <div class="grid grid-3">
              <div>
                <label>Gold</label>
                <input name="gold" value="0" placeholder="0">
              </div>
              <div>
                <label>Silver</label>
                <input name="silver" value="0" placeholder="0">
              </div>
              <div>
                <label>Copper</label>
                <input name="copper" value="0" placeholder="0">
              </div>
            </div>

            <label>Subject</label>
            <input name="subject" value="FrozenThrone Reward" required>

            <label>Message</label>
            <textarea name="body" rows="5">Enjoy your reward!</textarea>

            <button class="btn" type="submit">Send Item Mail</button>
            <a class="btn secondary" href="/admin">Back to Admin</a>
          </form>
        </div>
      </section>
    </main>
  `);
});

app.post("/admin/mail", requireGM, async (req, res) => {
  const realmKey = String(req.body.realm || "main");
  const realm = realms.find(r => r.key === realmKey);
  const characterName = String(req.body.character || "").trim();
  const itemEntryRaw = String(req.body.itemEntry || "").trim();
  const itemEntry = itemEntryRaw ? Number(itemEntryRaw) : 0;
  const quantity = Math.max(1, Math.min(1000, Number(req.body.quantity || 1)));
  const gold = Math.max(0, Math.min(1000000, Number(req.body.gold || 0)));
  const silver = Math.max(0, Math.min(99, Number(req.body.silver || 0)));
  const copper = Math.max(0, Math.min(99, Number(req.body.copper || 0)));
  const moneyCopper = Math.floor((gold * 10000) + (silver * 100) + copper);
  const subject = String(req.body.subject || "FrozenThrone Reward").trim();
  const body = String(req.body.body || "").trim();

  if (!realm || !characterName || !Number.isInteger(itemEntry) || itemEntry < 0) {
    return render(req, res, "Mail Error", errorCard("Invalid mail request."));
  }

  if (itemEntry === 0 && moneyCopper === 0 && !body) {
    return render(req, res, "Mail Error", errorCard("Add an item, money, or a message before sending mail."));
  }

  const charConn = await characterDb(realm.db);
  const worldConn = await worldDb();
  const authConn = await authDb();

  try {
    await charConn.beginTransaction();

    const [chars] = await charConn.execute(
      "SELECT guid, name, account FROM characters WHERE name = ? AND (deleteDate IS NULL OR deleteDate = 0) LIMIT 1",
      [characterName]
    );

    if (!chars.length) {
      await charConn.rollback();
      return render(req, res, "Mail Error", errorCard("Character not found."));
    }

    const receiver = chars[0];

    let item = null;
    let itemGuid = 0;

    if (itemEntry > 0) {
      const [items] = await worldConn.execute(
        "SELECT entry, name, displayid, Quality FROM item_template WHERE entry = ? LIMIT 1",
        [itemEntry]
      );

      if (!items.length) {
        await charConn.rollback();
        return render(req, res, "Mail Error", errorCard("Item entry not found."));
      }

      item = items[0];

      const [itemMax] = await charConn.execute("SELECT COALESCE(MAX(guid), 0) + 1 AS nextGuid FROM item_instance");
      itemGuid = Number(itemMax[0].nextGuid);

      await charConn.execute(
        `INSERT INTO item_instance
         (guid, itemEntry, owner_guid, creatorGuid, giftCreatorGuid, count, duration, charges, flags, enchantments, randomPropertyId, durability, playedTime, text)
         VALUES (?, ?, ?, 0, 0, ?, 0, '', 0, '', 0, 0, 0, NULL)`,
        [itemGuid, itemEntry, receiver.guid, quantity]
      );
    }

    const [mailMax] = await charConn.execute("SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM mail");

    const mailId = Number(mailMax[0].nextId);
    const now = Math.floor(Date.now() / 1000);
    const expire = now + (30 * 24 * 60 * 60);

    await charConn.execute(
      `INSERT INTO mail
       (id, messageType, stationery, mailTemplateId, sender, receiver, subject, body, has_items, expire_time, deliver_time, money, cod, checked)
       VALUES (?, 0, 41, 0, 0, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [mailId, receiver.guid, subject, body, itemGuid ? 1 : 0, expire, now, moneyCopper]
    );

    if (itemGuid) {
      await charConn.execute(
        "INSERT INTO mail_items (mail_id, item_guid, receiver) VALUES (?, ?, ?)",
        [mailId, itemGuid, receiver.guid]
      );
    }

    await charConn.commit();

    await authConn.execute(
      "INSERT INTO ft_admin_log (account_id, username, action, details) VALUES (?, ?, ?, ?)",
      [
        req.user.id,
        req.user.username,
        "SEND_ITEM_MAIL",
        `Realm=${realm.name}; Character=${receiver.name}; CharGUID=${receiver.guid}; Item=${item ? item.name : "None"}; Entry=${itemEntry || 0}; Qty=${itemGuid ? quantity : 0}; Money=${gold}g ${silver}s ${copper}c; MailID=${mailId}; ItemGUID=${itemGuid || 0}`
      ]
    );

    render(req, res, "Mail Sent", `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">Mail Sent</p>
            <h1>Item Delivered</h1>
            <p>The item was mailed successfully.</p>
          </div>

          <div class="card highlight">
            <h3>${item ? esc(item.name) : "Mail Sent"}</h3>
            ${item ? `<p><img class="item-icon" src="${itemIconUrl(item.displayid)}" alt=""> Entry ${esc(itemEntry)} · Quantity ${esc(quantity)}</p>` : `<p>No item attached.</p>`}
            <p>Money Sent: <strong>${esc(gold)}g ${esc(silver)}s ${esc(copper)}c</strong></p>
            <p>Sent to <strong>${esc(receiver.name)}</strong> on ${esc(realm.name)}.</p>
            <p class="muted">Mail ID ${esc(mailId)} · Item GUID ${esc(itemGuid)}</p>
            <a class="btn" href="/admin/player/${realm.key}/${receiver.guid}">Inspect Player</a>
            <a class="btn secondary" href="/admin/mail">Send Another</a>
            <a class="btn secondary" href="/admin">Admin</a>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    try { await charConn.rollback(); } catch {}
    console.error("admin mail failed", err);
    render(req, res, "Mail Error", errorCard("Mail send failed. Check logs."));
  } finally {
    await charConn.end();
    await worldConn.end();
    await authConn.end();
  }
});




app.get("/admin/search", requireGM, async (req, res) => {
  const activeRealm = await getActiveRealm(req);
  const q = String(req.query.q || "").trim();

  let players = [];
  let accounts = [];
  let items = [];
  let npcs = [];
  let quests = [];
  let logs = [];

  try {
    const authConn = await authDb();
    const charConn = await characterDb(activeRealm.characters_db);
    const worldConn = await worldDb(activeRealm.world_db);

    if (q) {
      if (/^\d+$/.test(q)) {
        const id = Number(q);

        const [playerRows] = await charConn.execute(
          `SELECT guid, name, level, race, class, account, online
           FROM characters
           WHERE guid = ? OR account = ?
           LIMIT 25`,
          [id, id]
        );
        players = playerRows;

        const [accountRows] = await authConn.execute(
          `SELECT id, username, email, last_ip, joindate
           FROM account
           WHERE id = ?
           LIMIT 25`,
          [id]
        );
        accounts = accountRows;

        const [itemRows] = await worldConn.execute(
          `SELECT entry, name, Quality, ItemLevel, displayid
           FROM item_template
           WHERE entry = ?
           LIMIT 25`,
          [id]
        );
        items = itemRows;

        const [npcRows] = await worldConn.execute(
          `SELECT entry, name, subname, minlevel, maxlevel, npcflag, scale
           FROM creature_template
           WHERE entry = ?
           LIMIT 25`,
          [id]
        );
        npcs = npcRows;

        const [questRows] = await worldConn.execute(
          `SELECT ID, LogTitle, QuestLevel, MinLevel
           FROM quest_template
           WHERE ID = ?
           LIMIT 25`,
          [id]
        );
        quests = questRows;
      } else {
        const like = `%${q}%`;

        const [playerRows] = await charConn.execute(
          `SELECT guid, name, level, race, class, account, online
           FROM characters
           WHERE name LIKE ? AND (deleteDate IS NULL OR deleteDate = 0)
           ORDER BY level DESC, name ASC
           LIMIT 25`,
          [like]
        );
        players = playerRows;

        const [accountRows] = await authConn.execute(
          `SELECT id, username, email, last_ip, joindate
           FROM account
           WHERE username LIKE ? OR email LIKE ?
           ORDER BY id ASC
           LIMIT 25`,
          [like, like]
        );
        accounts = accountRows;

        const [itemRows] = await worldConn.execute(
          `SELECT entry, name, Quality, ItemLevel, displayid
           FROM item_template
           WHERE name LIKE ?
           ORDER BY ItemLevel DESC, entry ASC
           LIMIT 25`,
          [like]
        );
        items = itemRows;

        const [npcRows] = await worldConn.execute(
          `SELECT entry, name, subname, minlevel, maxlevel, npcflag, scale
           FROM creature_template
           WHERE name LIKE ? OR subname LIKE ?
           ORDER BY entry ASC
           LIMIT 25`,
          [like, like]
        );
        npcs = npcRows;

        const [questRows] = await worldConn.execute(
          `SELECT ID, LogTitle, QuestLevel, MinLevel
           FROM quest_template
           WHERE LogTitle LIKE ?
           ORDER BY QuestLevel DESC, ID ASC
           LIMIT 25`,
          [like]
        );
        quests = questRows;

        const [logRows] = await authConn.execute(
          `SELECT id, username, action, details, created_at
           FROM ft_admin_log
           WHERE username LIKE ? OR action LIKE ? OR details LIKE ?
           ORDER BY id DESC
           LIMIT 25`,
          [like, like, like]
        );
        logs = logRows;
      }
    }

    await authConn.end();
    await charConn.end();
    await worldConn.end();

    const playerRows = players.map(x => `
      <tr>
        <td><a href="/admin/player/${activeRealm.realm_key}/${x.guid}"><strong>${esc(x.name)}</strong></a></td>
        <td>${esc(x.guid)}</td>
        <td><a href="/admin/account/${x.account}">${esc(x.account)}</a></td>
        <td>${esc(x.level)}</td>
        <td>${esc(raceName(x.race))}</td>
        <td>${esc(className(x.class))}</td>
        <td>${x.online ? "Online" : "Offline"}</td>
      </tr>
    `).join("");

    const accountRows = accounts.map(x => `
      <tr>
        <td><a href="/admin/account/${x.id}"><strong>${esc(x.username)}</strong></a></td>
        <td>${esc(x.id)}</td>
        <td>${esc(x.email || "")}</td>
        <td>${esc(x.last_ip || "")}</td>
        <td>${esc(x.joindate || "")}</td>
      </tr>
    `).join("");

    const itemRows = items.map(x => `
      <tr>
        <td><a href="/admin/item/${x.entry}"><img class="item-icon" src="${itemIconUrl(x.displayid)}" alt=""> <strong>${esc(x.name)}</strong></a></td>
        <td>${esc(x.entry)}</td>
        <td>${esc(x.ItemLevel)}</td>
        <td>${esc(itemQualityName(x.Quality))}</td>
      </tr>
    `).join("");

    const npcRows = npcs.map(x => `
      <tr>
        <td><a href="/admin/npc/${x.entry}"><strong>${esc(x.name)}</strong></a></td>
        <td>${esc(x.entry)}</td>
        <td>${esc(x.subname || "")}</td>
        <td>${esc(x.minlevel)}-${esc(x.maxlevel)}</td>
        <td><a href="/admin/npc/${x.entry}/vendor">Vendor</a></td>
      </tr>
    `).join("");

    const questRows = quests.map(x => `
      <tr>
        <td><a href="/admin/quest/${x.ID}"><strong>${esc(x.LogTitle || "Untitled Quest")}</strong></a></td>
        <td>${esc(x.ID)}</td>
        <td>${esc(x.QuestLevel)}</td>
        <td>${esc(x.MinLevel)}</td>
        <td><a href="/admin/quest/${x.ID}/edit">Edit</a></td>
      </tr>
    `).join("");

    const logRows = logs.map(x => `
      <tr>
        <td>${esc(x.id)}</td>
        <td>${esc(x.created_at)}</td>
        <td>${esc(x.username)}</td>
        <td>${esc(x.action)}</td>
        <td>${esc(x.details || "")}</td>
      </tr>
    `).join("");

    render(req, res, "Global Search", `
      <main class="container">
        <section>
          ${realmBadge(activeRealm)}

          <div class="section-head">
            <p class="eyebrow">FrozenThrone OS</p>
            <h1>Global Search</h1>
            <p>Search players, accounts, items, NPCs, quests, and logs from one place.</p>
          </div>

          <div class="card highlight">
            <form method="GET" action="/admin/search">
              <label>Search Anything</label>
              <input name="q" value="${esc(q)}" placeholder="Frozen, 900001, Shadowmourne, 900100, quest title">
              <button class="btn" type="submit">Search</button>
              <a class="btn secondary" href="/admin">Dashboard</a>
            </form>
          </div>

          ${q ? `
            <div class="grid grid-2">
              <div class="card">
                <h3>👥 Players</h3>
                <div class="table-wrap"><table class="data-table">
                  <thead><tr><th>Name</th><th>GUID</th><th>Account</th><th>Level</th><th>Race</th><th>Class</th><th>Status</th></tr></thead>
                  <tbody>${playerRows || `<tr><td colspan="7">No players found.</td></tr>`}</tbody>
                </table></div>
              </div>

              <div class="card">
                <h3>👤 Accounts</h3>
                <div class="table-wrap"><table class="data-table">
                  <thead><tr><th>Username</th><th>ID</th><th>Email</th><th>Last IP</th><th>Join Date</th></tr></thead>
                  <tbody>${accountRows || `<tr><td colspan="5">No accounts found.</td></tr>`}</tbody>
                </table></div>
              </div>
            </div>

            <div class="grid grid-2">
              <div class="card">
                <h3>🎒 Items</h3>
                <div class="table-wrap"><table class="data-table">
                  <thead><tr><th>Item</th><th>Entry</th><th>iLvl</th><th>Quality</th></tr></thead>
                  <tbody>${itemRows || `<tr><td colspan="4">No items found.</td></tr>`}</tbody>
                </table></div>
              </div>

              <div class="card">
                <h3>🧙 NPCs</h3>
                <div class="table-wrap"><table class="data-table">
                  <thead><tr><th>Name</th><th>Entry</th><th>Subname</th><th>Level</th><th>Vendor</th></tr></thead>
                  <tbody>${npcRows || `<tr><td colspan="5">No NPCs found.</td></tr>`}</tbody>
                </table></div>
              </div>
            </div>

            <div class="grid grid-2">
              <div class="card">
                <h3>📜 Quests</h3>
                <div class="table-wrap"><table class="data-table">
                  <thead><tr><th>Quest</th><th>ID</th><th>Level</th><th>Min</th><th>Edit</th></tr></thead>
                  <tbody>${questRows || `<tr><td colspan="5">No quests found.</td></tr>`}</tbody>
                </table></div>
              </div>

              <div class="card">
                <h3>📋 Logs</h3>
                <div class="table-wrap"><table class="data-table">
                  <thead><tr><th>ID</th><th>Time</th><th>GM</th><th>Action</th><th>Details</th></tr></thead>
                  <tbody>${logRows || `<tr><td colspan="5">No logs found.</td></tr>`}</tbody>
                </table></div>
              </div>
            </div>
          ` : ""}
        </section>
      </main>
    `);
  } catch (err) {
    console.error("global search failed", err);
    render(req, res, "Search Error", errorCard("Global search failed. Check logs."));
  }
});

app.get("/admin/items", requireGM, async (req, res) => {
  const activeRealm = await getActiveRealm(req);
  const q = String(req.query.q || req.query.item || "").trim();

  try {
    const worldConn = await worldDb(activeRealm.world_db);
    let rows = [];

    if (q) {
      if (/^\d+$/.test(q)) {
        const [found] = await worldConn.execute(
          `SELECT entry, name, Quality, ItemLevel, RequiredLevel, InventoryType, class, subclass, displayid
           FROM item_template
           WHERE entry = ?
           LIMIT 100`,
          [Number(q)]
        );
        rows = found;
      } else {
        const [found] = await worldConn.execute(
          `SELECT entry, name, Quality, ItemLevel, RequiredLevel, InventoryType, class, subclass, displayid
           FROM item_template
           WHERE name LIKE ?
           ORDER BY ItemLevel DESC, entry ASC
           LIMIT 100`,
          [`%${q}%`]
        );
        rows = found;
      }
    }

    await worldConn.end();

    const resultRows = rows.map(i => `
      <tr>
        <td><a href="/admin/item/${i.entry}"><img class="item-icon" src="${itemIconUrl(i.displayid)}" alt=""> <strong>${esc(i.name)}</strong></a></td>
        <td>${esc(i.entry)}</td>
        <td>${esc(i.ItemLevel)}</td>
        <td>${esc(i.RequiredLevel)}</td>
        <td>${esc(itemQualityName(i.Quality))}</td>
        <td>${esc(i.class)}</td>
        <td>${esc(i.subclass)}</td>
      </tr>
    `).join("");

    render(req, res, "Item Module", `
      <main class="container">
        <section>
          ${realmBadge(activeRealm)}

          <div class="section-head">
            <p class="eyebrow">FrozenThrone OS · Content</p>
            <h1>Items</h1>
            <p>Search item_template, inspect owners, vendors, drops, and quest links.</p>
          </div>

          <div class="card">
            <form method="GET" action="/admin/items">
              <label>Item ID or Name</label>
              <input name="q" value="${esc(q)}" placeholder="900001, Shadowmourne, Portable Hole">
              <button class="btn" type="submit">Search Items</button>
              <a class="btn secondary" href="/admin">Dashboard</a>
            </form>
          </div>

          ${q ? `
          <div class="card">
            <h3>Item Results</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Item</th><th>Entry</th><th>iLvl</th><th>Req Level</th><th>Quality</th><th>Class</th><th>Subclass</th></tr></thead>
                <tbody>${resultRows || `<tr><td colspan="7">No items found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>` : ""}

          <div class="grid grid-3">
            <a class="card admin-card" href="/admin/items?q=900001"><h3>🌟 Custom Items</h3><p class="muted">Search your custom ID range.</p></a>
            <a class="card admin-card" href="/admin/items?q=Shadowmourne"><h3>⚔️ Legendary Search</h3><p class="muted">Quick test search.</p></a>
            <a class="card admin-card" href="/admin/mail"><h3>📬 Mail Item</h3><p class="muted">Send items to players.</p></a>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error("items module failed", err);
    render(req, res, "Items Error", errorCard("Items module failed. Check logs."));
  }
});

app.get("/admin/npcs", requireGM, async (req, res) => {
  const q = String(req.query.q || "").trim();

  try {
    const worldConn = await worldDb();
    let rows = [];

    if (q) {
      if (/^\d+$/.test(q)) {
        const [found] = await worldConn.execute(
          `SELECT entry, name, subname, minlevel, maxlevel, faction, npcflag, scale, AIName, ScriptName
           FROM creature_template
           WHERE entry = ?
           LIMIT 100`,
          [Number(q)]
        );
        rows = found;
      } else {
        const [found] = await worldConn.execute(
          `SELECT entry, name, subname, minlevel, maxlevel, faction, npcflag, scale, AIName, ScriptName
           FROM creature_template
           WHERE name LIKE ?
           ORDER BY entry ASC
           LIMIT 100`,
          [`%${q}%`]
        );
        rows = found;
      }
    }

    await worldConn.end();

    const resultRows = rows.map(n => `
      <tr>
        <td><a href="/admin/npc/${n.entry}">${esc(n.entry)}</a></td>
        <td><a href="/admin/npc/${n.entry}"><strong>${esc(n.name)}</strong></a></td>
        <td>${esc(n.subname || "")}</td>
        <td>${esc(n.minlevel)} - ${esc(n.maxlevel)}</td>
        <td>${esc(n.faction)}</td>
        <td>${esc(n.npcflag)}</td>
        <td>${esc(n.scale)}</td>
        <td>${esc(n.AIName || "")}</td>
        <td>${esc(n.ScriptName || "")}</td>
      </tr>
    `).join("");

    render(req, res, "NPC Database", `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">GM NPC Database</p>
            <h1>NPC Search</h1>
            <p>Search creature_template by entry ID or name.</p>
          </div>

          <div class="card">
            <form method="GET" action="/admin/npcs">
              <label>NPC Entry or Name</label>
              <input name="q" value="${esc(q)}" placeholder="900100, Teleporter, Lich King">
              <button class="btn" type="submit">Search NPCs</button>
              <a class="btn secondary" href="/admin">Back to Admin</a>
            </form>
          </div>

          ${q ? `
          <div class="card">
            <h3>NPC Results</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Entry</th><th>Name</th><th>Subname</th><th>Level</th><th>Faction</th><th>NPC Flags</th><th>Scale</th><th>AI</th><th>Script</th></tr></thead>
                <tbody>${resultRows || `<tr><td colspan="9">No NPCs found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>` : ""}
        </section>
      </main>
    `);
  } catch (err) {
    console.error("npc search failed", err);
    render(req, res, "NPC Error", errorCard("NPC search failed. Check logs."));
  }
});

app.get("/admin/npc/:entry", requireGM, async (req, res) => {
  const entry = Number(req.params.entry);

  if (!Number.isInteger(entry) || entry <= 0) {
    return render(req, res, "NPC Inspector", errorCard("Invalid NPC entry."));
  }

  try {
    const worldConn = await worldDb();

    const [npcs] = await worldConn.execute(
      `SELECT *
       FROM creature_template
       WHERE entry = ?
       LIMIT 1`,
      [entry]
    );

    if (!npcs.length) {
      await worldConn.end();
      return render(req, res, "NPC Inspector", errorCard("NPC not found."));
    }

    const npc = npcs[0];

    const [spawns] = await worldConn.execute(
      `SELECT guid, id, map, zoneId, areaId, position_x, position_y, position_z, orientation, spawntimesecs, spawnMask, phaseMask
       FROM creature
       WHERE id = ?
       ORDER BY map ASC, guid ASC
       LIMIT 200`,
      [entry]
    );

    const [vendorItems] = await worldConn.execute(
      `SELECT nv.slot, nv.item, nv.maxcount, nv.incrtime, nv.ExtendedCost,
              it.name, it.Quality, it.ItemLevel, it.displayid
       FROM npc_vendor nv
       LEFT JOIN item_template it ON it.entry = nv.item
       WHERE nv.entry = ?
       ORDER BY nv.slot ASC, nv.item ASC
       LIMIT 300`,
      [entry]
    );

    const [loot] = await worldConn.execute(
      `SELECT clt.Item, clt.Chance, clt.MinCount, clt.MaxCount, clt.QuestRequired, clt.Comment,
              it.name, it.Quality, it.ItemLevel, it.displayid
       FROM creature_loot_template clt
       LEFT JOIN item_template it ON it.entry = clt.Item
       WHERE clt.Entry = ? OR clt.Entry = ?
       ORDER BY clt.Chance DESC, clt.Item ASC
       LIMIT 300`,
      [entry, npc.lootid]
    );

    const [questStarts] = await worldConn.execute(
      `SELECT qs.quest, qt.LogTitle
       FROM creature_queststarter qs
       LEFT JOIN quest_template qt ON qt.ID = qs.quest
       WHERE qs.id = ?
       ORDER BY qs.quest ASC
       LIMIT 200`,
      [entry]
    );

    const [questEnds] = await worldConn.execute(
      `SELECT qe.quest, qt.LogTitle
       FROM creature_questender qe
       LEFT JOIN quest_template qt ON qt.ID = qe.quest
       WHERE qe.id = ?
       ORDER BY qe.quest ASC
       LIMIT 200`,
      [entry]
    );

    await worldConn.end();

    const spawnRows = spawns.map(sp => `
      <tr>
        <td>${esc(sp.guid)}</td>
        <td>${esc(sp.map)}</td>
        <td>${esc(sp.zoneId)}</td>
        <td>${esc(sp.areaId)}</td>
        <td>${esc(Number(sp.position_x).toFixed(2))}</td>
        <td>${esc(Number(sp.position_y).toFixed(2))}</td>
        <td>${esc(Number(sp.position_z).toFixed(2))}</td>
        <td>${esc(Number(sp.orientation).toFixed(2))}</td>
        <td>${esc(sp.spawntimesecs)}</td>
      </tr>
    `).join("");

    const vendorRows = vendorItems.map(v => `
      <tr>
        <td>${esc(v.slot)}</td>
        <td><a href="/admin/item/${v.item}"><img class="item-icon" src="${itemIconUrl(v.displayid)}" alt=""> <strong>${esc(v.name || "Unknown Item")}</strong></a></td>
        <td>${esc(v.item)}</td>
        <td>${esc(v.ItemLevel || "")}</td>
        <td>${esc(itemQualityName(v.Quality))}</td>
        <td>${esc(v.maxcount)}</td>
        <td>${esc(v.incrtime)}</td>
        <td>${esc(v.ExtendedCost)}</td>
      </tr>
    `).join("");

    const lootRows = loot.map(l => `
      <tr>
        <td><a href="/admin/item/${l.Item}"><img class="item-icon" src="${itemIconUrl(l.displayid)}" alt=""> <strong>${esc(l.name || "Unknown Item")}</strong></a></td>
        <td>${esc(l.Item)}</td>
        <td>${esc(l.Chance)}%</td>
        <td>${esc(l.MinCount)} - ${esc(l.MaxCount)}</td>
        <td>${l.QuestRequired ? "Yes" : "No"}</td>
        <td>${esc(l.Comment || "")}</td>
      </tr>
    `).join("");

    const startRows = questStarts.map(q => `
      <tr><td>${esc(q.quest)}</td><td>${esc(q.LogTitle || "")}</td></tr>
    `).join("");

    const endRows = questEnds.map(q => `
      <tr><td>${esc(q.quest)}</td><td>${esc(q.LogTitle || "")}</td></tr>
    `).join("");

    render(req, res, `${npc.name} NPC Inspector`, `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">GM NPC Inspector</p>
            <h1>${esc(npc.name)}</h1>
            <p>${esc(npc.subname || "")} · Entry ${esc(npc.entry)} · Level ${esc(npc.minlevel)}-${esc(npc.maxlevel)}</p>
          </div>

          <div class="grid grid-4">
            <div class="card stat"><span>Entry</span><strong>${esc(npc.entry)}</strong></div>
            <div class="card stat"><span>Faction</span><strong>${esc(npc.faction)}</strong></div>
            <div class="card stat"><span>NPC Flags</span><strong>${esc(npc.npcflag)}</strong></div>
            <div class="card stat"><span>Scale</span><strong>${esc(npc.scale)}</strong></div>
            <div class="card stat"><span>Model 1</span><strong>${esc(npc.modelid1)}</strong></div>
            <div class="card stat"><span>Loot ID</span><strong>${esc(npc.lootid)}</strong></div>
            <div class="card stat"><span>AI</span><strong>${esc(npc.AIName || "None")}</strong></div>
            <div class="card stat"><span>Script</span><strong>${esc(npc.ScriptName || "None")}</strong></div>
          </div>

          <div class="grid grid-2">
            <div class="card">
              <h3>Combat / Template</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <tbody>
                    <tr><td>Rank</td><td>${esc(npc.rank)}</td></tr>
                    <tr><td>Unit Class</td><td>${esc(npc.unit_class)}</td></tr>
                    <tr><td>Type</td><td>${esc(npc.type)}</td></tr>
                    <tr><td>Base Attack Time</td><td>${esc(npc.BaseAttackTime)}</td></tr>
                    <tr><td>Range Attack Time</td><td>${esc(npc.RangeAttackTime)}</td></tr>
                    <tr><td>Health Modifier</td><td>${esc(npc.HealthModifier)}</td></tr>
                    <tr><td>Damage Modifier</td><td>${esc(npc.DamageModifier)}</td></tr>
                    <tr><td>Armor Modifier</td><td>${esc(npc.ArmorModifier)}</td></tr>
                    <tr><td>Movement Type</td><td>${esc(npc.MovementType)}</td></tr>
                    <tr><td>Gossip Menu</td><td>${esc(npc.gossip_menu_id)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <h3>Related Links</h3>
              <a class="btn secondary" href="/admin/npcs?q=${esc(npc.entry)}">Search This Entry</a>
              <a class="btn secondary" href="/admin/npcs?q=${encodeURIComponent(npc.name)}">Search Same Name</a>
              <a class="btn secondary" href="/admin">Back to Admin</a>
            </div>
          </div>

          <div class="card">
            <h3>Spawn Locations</h3>
            <p class="muted">Private GM data. This is not public Armory information.</p>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Spawn GUID</th><th>Map</th><th>Zone</th><th>Area</th><th>X</th><th>Y</th><th>Z</th><th>O</th><th>Respawn</th></tr></thead>
                <tbody>${spawnRows || `<tr><td colspan="9">No spawns found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <h3>Vendor Items</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Slot</th><th>Item</th><th>Entry</th><th>iLvl</th><th>Quality</th><th>Max</th><th>Restock</th><th>Ext Cost</th></tr></thead>
                <tbody>${vendorRows || `<tr><td colspan="8">This NPC sells no vendor items.</td></tr>`}</tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <h3>Loot</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Item</th><th>Entry</th><th>Chance</th><th>Count</th><th>Quest</th><th>Comment</th></tr></thead>
                <tbody>${lootRows || `<tr><td colspan="6">No creature loot found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>

          <div class="grid grid-2">
            <div class="card">
              <h3>Quest Starter</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>Quest ID</th><th>Title</th></tr></thead>
                  <tbody>${startRows || `<tr><td colspan="2">Starts no quests.</td></tr>`}</tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <h3>Quest Ender</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>Quest ID</th><th>Title</th></tr></thead>
                  <tbody>${endRows || `<tr><td colspan="2">Ends no quests.</td></tr>`}</tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error("npc inspector failed", err);
    render(req, res, "NPC Error", errorCard("NPC inspector failed. Check logs."));
  }
});


app.get("/admin/npc/:entry/vendor", requireGM, async (req, res) => {
  const entry = Number(req.params.entry);
  if (!Number.isInteger(entry) || entry <= 0) {
    return render(req, res, "Vendor Editor", errorCard("Invalid NPC entry."));
  }

  try {
    const worldConn = await worldDb();

    const [npcs] = await worldConn.execute(
      "SELECT entry, name, subname, npcflag FROM creature_template WHERE entry = ? LIMIT 1",
      [entry]
    );

    if (!npcs.length) {
      await worldConn.end();
      return render(req, res, "Vendor Editor", errorCard("NPC not found."));
    }

    const npc = npcs[0];

    const [items] = await worldConn.execute(
      `SELECT nv.slot, nv.item, nv.maxcount, nv.incrtime, nv.ExtendedCost,
              it.name, it.Quality, it.ItemLevel, it.displayid
       FROM npc_vendor nv
       LEFT JOIN item_template it ON it.entry = nv.item
       WHERE nv.entry = ?
       ORDER BY nv.slot ASC, nv.item ASC`,
      [entry]
    );

    await worldConn.end();

    const rows = items.map(v => `
      <tr>
        <td>${esc(v.slot)}</td>
        <td><a href="/admin/item/${v.item}"><img class="item-icon" src="${itemIconUrl(v.displayid)}" alt=""> <strong>${esc(v.name || "Unknown Item")}</strong></a></td>
        <td>${esc(v.item)}</td>
        <td>${esc(v.ItemLevel || "")}</td>
        <td>${esc(itemQualityName(v.Quality))}</td>
        <td>${esc(v.maxcount)}</td>
        <td>${esc(v.incrtime)}</td>
        <td>${esc(v.ExtendedCost)}</td>
        <td>
          <form method="POST" action="/admin/npc/${entry}/vendor/remove" onsubmit="return confirm('Remove item ${esc(v.item)} from this vendor?');">
            <input type="hidden" name="item" value="${esc(v.item)}">
            <input type="hidden" name="slot" value="${esc(v.slot)}">
            <input type="hidden" name="extendedCost" value="${esc(v.ExtendedCost)}">
            <button class="btn danger" type="submit">Remove</button>
          </form>
        </td>
      </tr>
    `).join("");

    render(req, res, `${npc.name} Vendor Editor`, `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">GM Vendor Editor</p>
            <h1>${esc(npc.name)}</h1>
            <p>${esc(npc.subname || "")} · Entry ${esc(npc.entry)} · NPC Flags ${esc(npc.npcflag)}</p>
          </div>

          <div class="grid grid-2">
            <div class="card">
              <h3>Add Vendor Item</h3>
              <form method="POST" action="/admin/npc/${entry}/vendor/add">
                <label>Item Entry ID</label>
                <input name="item" placeholder="900001" required>

                <label>Slot</label>
                <input name="slot" value="0" required>

                <label>Max Count</label>
                <input name="maxcount" value="0" required>

                <label>Restock Seconds</label>
                <input name="incrtime" value="0" required>

                <label>Extended Cost</label>
                <input name="extendedCost" value="0" required>

                <button class="btn" type="submit">Add Item</button>
                <a class="btn secondary" href="/admin/npc/${entry}">Back to NPC</a>
              </form>
            </div>

            <div class="card highlight">
              <h3>Notes</h3>
              <p class="muted">Changes write directly to world.npc_vendor and are logged to ft_admin_log.</p>
              <p class="muted">If the vendor is already spawned, use a server reload/restart if the item does not appear immediately.</p>
            </div>
          </div>

          <div class="card">
            <h3>Current Vendor Items</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Slot</th><th>Item</th><th>Entry</th><th>iLvl</th><th>Quality</th><th>Max</th><th>Restock</th><th>Ext Cost</th><th>Action</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="9">This NPC has no vendor items.</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error("vendor editor failed", err);
    render(req, res, "Vendor Editor Error", errorCard("Vendor editor failed. Check logs."));
  }
});

app.post("/admin/npc/:entry/vendor/add", requireGM, async (req, res) => {
  const entry = Number(req.params.entry);
  const item = Number(req.body.item);
  const slot = Number(req.body.slot || 0);
  const maxcount = Number(req.body.maxcount || 0);
  const incrtime = Number(req.body.incrtime || 0);
  const extendedCost = Number(req.body.extendedCost || 0);

  if (![entry, item, slot, maxcount, incrtime, extendedCost].every(Number.isInteger) || entry <= 0 || item <= 0) {
    return render(req, res, "Vendor Error", errorCard("Invalid vendor item request."));
  }

  const worldConn = await worldDb();
  const authConn = await authDb();

  try {
    const [npcRows] = await worldConn.execute("SELECT entry, name FROM creature_template WHERE entry = ? LIMIT 1", [entry]);
    const [itemRows] = await worldConn.execute("SELECT entry, name FROM item_template WHERE entry = ? LIMIT 1", [item]);

    if (!npcRows.length) return render(req, res, "Vendor Error", errorCard("NPC not found."));
    if (!itemRows.length) return render(req, res, "Vendor Error", errorCard("Item not found."));

    await worldConn.execute(
      `INSERT INTO npc_vendor (entry, slot, item, maxcount, incrtime, ExtendedCost, VerifiedBuild)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [entry, slot, item, maxcount, incrtime, extendedCost]
    );

    await authConn.execute(
      "INSERT INTO ft_admin_log (account_id, username, action, details) VALUES (?, ?, ?, ?)",
      [req.user.id, req.user.username, "VENDOR_ADD_ITEM", `NPC=${npcRows[0].name}(${entry}); Item=${itemRows[0].name}(${item}); Slot=${slot}`]
    );

    res.redirect(`/admin/npc/${entry}/vendor`);
  } catch (err) {
    console.error("vendor add failed", err);
    render(req, res, "Vendor Error", errorCard("Adding vendor item failed. It may already exist in that slot/cost combo."));
  } finally {
    await worldConn.end();
    await authConn.end();
  }
});

app.post("/admin/npc/:entry/vendor/remove", requireGM, async (req, res) => {
  const entry = Number(req.params.entry);
  const item = Number(req.body.item);
  const slot = Number(req.body.slot || 0);
  const extendedCost = Number(req.body.extendedCost || 0);

  if (![entry, item, slot, extendedCost].every(Number.isInteger) || entry <= 0 || item <= 0) {
    return render(req, res, "Vendor Error", errorCard("Invalid remove request."));
  }

  const worldConn = await worldDb();
  const authConn = await authDb();

  try {
    await worldConn.execute(
      "DELETE FROM npc_vendor WHERE entry = ? AND item = ? AND slot = ? AND ExtendedCost = ? LIMIT 1",
      [entry, item, slot, extendedCost]
    );

    await authConn.execute(
      "INSERT INTO ft_admin_log (account_id, username, action, details) VALUES (?, ?, ?, ?)",
      [req.user.id, req.user.username, "VENDOR_REMOVE_ITEM", `NPC=${entry}; Item=${item}; Slot=${slot}; ExtendedCost=${extendedCost}`]
    );

    res.redirect(`/admin/npc/${entry}/vendor`);
  } catch (err) {
    console.error("vendor remove failed", err);
    render(req, res, "Vendor Error", errorCard("Removing vendor item failed."));
  } finally {
    await worldConn.end();
    await authConn.end();
  }
});


app.get("/admin/quests", requireGM, async (req, res) => {
  const q = String(req.query.q || "").trim();

  try {
    const worldConn = await worldDb();
    let rows = [];

    if (q) {
      if (/^\d+$/.test(q)) {
        const [found] = await worldConn.execute(
          `SELECT ID, LogTitle, QuestLevel, MinLevel, QuestSortID, QuestType
           FROM quest_template
           WHERE ID = ?
           LIMIT 100`,
          [Number(q)]
        );
        rows = found;
      } else {
        const [found] = await worldConn.execute(
          `SELECT ID, LogTitle, QuestLevel, MinLevel, QuestSortID, QuestType
           FROM quest_template
           WHERE LogTitle LIKE ?
           ORDER BY QuestLevel DESC, ID ASC
           LIMIT 100`,
          [`%${q}%`]
        );
        rows = found;
      }
    } else {
      const [found] = await worldConn.execute(
        `SELECT ID, LogTitle, QuestLevel, MinLevel, QuestSortID, QuestType
         FROM quest_template
         ORDER BY ID ASC
         LIMIT 50`
      );
      rows = found;
    }

    await worldConn.end();

    const resultRows = rows.map(q => `
      <tr>
        <td><a href="/admin/quest/${q.ID}">${esc(q.ID)}</a></td>
        <td><a href="/admin/quest/${q.ID}"><strong>${esc(q.LogTitle || "Untitled Quest")}</strong></a></td>
        <td>${esc(q.QuestLevel)}</td>
        <td>${esc(q.MinLevel)}</td>
        <td>${esc(q.QuestSortID)}</td>
        <td>${esc(q.QuestType)}</td>
      </tr>
    `).join("");

    render(req, res, "Quest Database", `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">GM Quest Database</p>
            <h1>Quest Database</h1>
            <p>${q ? `Showing quest results for <strong>${esc(q)}</strong>.` : "Showing the first 50 quests by ID."}</p>
          </div>

          <div class="card">
            <form method="GET" action="/admin/quests">
              <label>Quest ID or Title</label>
              <input name="q" value="${esc(q)}" placeholder="The Missing Diplomat, 54, starter quest">
              <button class="btn" type="submit">Search Quests</button>
              <a class="btn secondary" href="/admin/quests">Reset</a>
              <a class="btn secondary" href="/admin">Back to Admin</a>
            </form>
          </div>

          <div class="card">
            <h3>${q ? "Quest Results" : "Default Quest List"}</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>Title</th><th>Quest Level</th><th>Min Level</th><th>Sort</th><th>Type</th></tr></thead>
                <tbody>${resultRows || `<tr><td colspan="6">No quests found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error("quest search failed", err);
    render(req, res, "Quest Error", errorCard("Quest search failed. Check logs."));
  }
});

app.get("/admin/quest/:id", requireGM, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return render(req, res, "Quest Inspector", errorCard("Invalid quest ID."));
  }

  try {
    const worldConn = await worldDb();

    const [quests] = await worldConn.execute(
      `SELECT *
       FROM quest_template
       WHERE ID = ?
       LIMIT 1`,
      [id]
    );

    if (!quests.length) {
      await worldConn.end();
      return render(req, res, "Quest Inspector", errorCard("Quest not found."));
    }

    const quest = quests[0];

    const [starters] = await worldConn.execute(
      `SELECT qs.id AS npcEntry, ct.name, ct.subname
       FROM creature_queststarter qs
       LEFT JOIN creature_template ct ON ct.entry = qs.id
       WHERE qs.quest = ?
       ORDER BY ct.name ASC`,
      [id]
    );

    const [enders] = await worldConn.execute(
      `SELECT qe.id AS npcEntry, ct.name, ct.subname
       FROM creature_questender qe
       LEFT JOIN creature_template ct ON ct.entry = qe.id
       WHERE qe.quest = ?
       ORDER BY ct.name ASC`,
      [id]
    );

    const itemIds = [];
    for (let n = 1; n <= 6; n++) {
      if (quest[`RequiredItemId${n}`]) itemIds.push(quest[`RequiredItemId${n}`]);
      if (quest[`RewardChoiceItemID${n}`]) itemIds.push(quest[`RewardChoiceItemID${n}`]);
    }
    for (let n = 1; n <= 4; n++) {
      if (quest[`RewardItem${n}`]) itemIds.push(quest[`RewardItem${n}`]);
      if (quest[`ItemDrop${n}`]) itemIds.push(quest[`ItemDrop${n}`]);
    }
    if (quest.StartItem) itemIds.push(quest.StartItem);

    let itemMap = new Map();
    const uniqueItems = [...new Set(itemIds.filter(Boolean))];

    if (uniqueItems.length) {
      const placeholders = uniqueItems.map(() => "?").join(",");
      const [items] = await worldConn.execute(
        `SELECT entry, name, Quality, ItemLevel, displayid
         FROM item_template
         WHERE entry IN (${placeholders})`,
        uniqueItems
      );
      itemMap = new Map(items.map(i => [Number(i.entry), i]));
    }

    const npcIds = [];
    for (let n = 1; n <= 4; n++) {
      const val = Number(quest[`RequiredNpcOrGo${n}`] || 0);
      if (val > 0) npcIds.push(val);
    }

    let npcMap = new Map();
    if (npcIds.length) {
      const placeholders = npcIds.map(() => "?").join(",");
      const [npcs] = await worldConn.execute(
        `SELECT entry, name, subname
         FROM creature_template
         WHERE entry IN (${placeholders})`,
        npcIds
      );
      npcMap = new Map(npcs.map(n => [Number(n.entry), n]));
    }

    await worldConn.end();

    const npcRows = (rows) => rows.map(n => `
      <tr>
        <td><a href="/admin/npc/${n.npcEntry}">${esc(n.name || "Unknown NPC")}</a></td>
        <td>${esc(n.npcEntry)}</td>
        <td>${esc(n.subname || "")}</td>
      </tr>
    `).join("");

    const itemLine = (entry, qty) => {
      if (!entry) return "";
      const item = itemMap.get(Number(entry)) || {};
      return `
        <tr>
          <td><a href="/admin/item/${entry}"><img class="item-icon" src="${itemIconUrl(item.displayid)}" alt=""> <strong>${esc(item.name || "Unknown Item")}</strong></a></td>
          <td>${esc(entry)}</td>
          <td>${esc(qty || 1)}</td>
          <td>${esc(itemQualityName(item.Quality))}</td>
        </tr>
      `;
    };

    const requiredItemRows = Array.from({ length: 6 }, (_, i) => {
      const n = i + 1;
      return itemLine(quest[`RequiredItemId${n}`], quest[`RequiredItemCount${n}`]);
    }).join("");

    const rewardRows = Array.from({ length: 4 }, (_, i) => {
      const n = i + 1;
      return itemLine(quest[`RewardItem${n}`], quest[`RewardAmount${n}`]);
    }).join("");

    const choiceRows = Array.from({ length: 6 }, (_, i) => {
      const n = i + 1;
      return itemLine(quest[`RewardChoiceItemID${n}`], quest[`RewardChoiceItemQuantity${n}`]);
    }).join("");

    const dropRows = Array.from({ length: 4 }, (_, i) => {
      const n = i + 1;
      return itemLine(quest[`ItemDrop${n}`], quest[`ItemDropQuantity${n}`]);
    }).join("");

    const killRows = Array.from({ length: 4 }, (_, i) => {
      const n = i + 1;
      const npcId = Number(quest[`RequiredNpcOrGo${n}`] || 0);
      const count = quest[`RequiredNpcOrGoCount${n}`];
      if (!npcId) return "";
      if (npcId > 0) {
        const npc = npcMap.get(npcId) || {};
        return `<tr><td><a href="/admin/npc/${npcId}">${esc(npc.name || "Unknown NPC")}</a></td><td>${esc(npcId)}</td><td>${esc(count)}</td></tr>`;
      }
      return `<tr><td>GameObject</td><td>${esc(npcId)}</td><td>${esc(count)}</td></tr>`;
    }).join("");

    render(req, res, `${quest.LogTitle} Quest Inspector`, `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">GM Quest Inspector</p>
            <h1>${esc(quest.LogTitle || "Untitled Quest")}</h1>
            <p>Quest ID ${esc(quest.ID)} · Level ${esc(quest.QuestLevel)} · Min Level ${esc(quest.MinLevel)}</p>
          </div>

          <div class="grid grid-4">
            <div class="card stat"><span>Quest ID</span><strong>${esc(quest.ID)}</strong></div>
            <div class="card stat"><span>Quest Level</span><strong>${esc(quest.QuestLevel)}</strong></div>
            <div class="card stat"><span>Min Level</span><strong>${esc(quest.MinLevel)}</strong></div>
            <div class="card stat"><span>Reward Money</span><strong>${moneyToGold(Math.max(0, quest.RewardMoney || 0))}</strong></div>
          </div>

          <div class="grid grid-2">
            <div class="card">
              <h3>Description</h3>
              <p>${esc(quest.QuestDescription || quest.LogDescription || "No description.")}</p>
              <p class="muted">${esc(quest.AreaDescription || "")}</p>
            </div>

            <div class="card">
              <h3>Completion</h3>
              <p>${esc(quest.QuestCompletionLog || "No completion log.")}</p>
              <p class="muted">Next Quest: ${esc(quest.RewardNextQuest || 0)}</p>
            </div>
          </div>

          <div class="grid grid-2">
            <div class="card">
              <h3>Quest Starters</h3>
              <div class="table-wrap"><table class="data-table">
                <thead><tr><th>NPC</th><th>Entry</th><th>Subname</th></tr></thead>
                <tbody>${npcRows(starters) || `<tr><td colspan="3">No creature starters found.</td></tr>`}</tbody>
              </table></div>
            </div>

            <div class="card">
              <h3>Quest Enders</h3>
              <div class="table-wrap"><table class="data-table">
                <thead><tr><th>NPC</th><th>Entry</th><th>Subname</th></tr></thead>
                <tbody>${npcRows(enders) || `<tr><td colspan="3">No creature enders found.</td></tr>`}</tbody>
              </table></div>
            </div>
          </div>

          <div class="grid grid-2">
            <div class="card">
              <h3>Required Kills / Objects</h3>
              <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Target</th><th>Entry</th><th>Count</th></tr></thead>
                <tbody>${killRows || `<tr><td colspan="3">No kill/object requirements.</td></tr>`}</tbody>
              </table></div>
            </div>

            <div class="card">
              <h3>Required Items</h3>
              <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Item</th><th>Entry</th><th>Qty</th><th>Quality</th></tr></thead>
                <tbody>${requiredItemRows || `<tr><td colspan="4">No required items.</td></tr>`}</tbody>
              </table></div>
            </div>
          </div>

          <div class="grid grid-2">
            <div class="card">
              <h3>Guaranteed Rewards</h3>
              <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Item</th><th>Entry</th><th>Qty</th><th>Quality</th></tr></thead>
                <tbody>${rewardRows || `<tr><td colspan="4">No guaranteed item rewards.</td></tr>`}</tbody>
              </table></div>
            </div>

            <div class="card">
              <h3>Choice Rewards</h3>
              <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Item</th><th>Entry</th><th>Qty</th><th>Quality</th></tr></thead>
                <tbody>${choiceRows || `<tr><td colspan="4">No choice rewards.</td></tr>`}</tbody>
              </table></div>
            </div>
          </div>

          <div class="card">
            <h3>Item Drops Used By Quest</h3>
            <div class="table-wrap"><table class="data-table">
              <thead><tr><th>Item</th><th>Entry</th><th>Qty</th><th>Quality</th></tr></thead>
              <tbody>${dropRows || `<tr><td colspan="4">No quest item drops listed.</td></tr>`}</tbody>
            </table></div>
          </div>

          <div class="card">
            <a class="btn" href="/admin/quest/${quest.ID}/edit">Edit Quest</a>
            <a class="btn secondary" href="/admin/quests">Back to Quest Search</a>
            <a class="btn secondary" href="/admin">Back to Admin</a>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error("quest inspector failed", err);
    render(req, res, "Quest Error", errorCard("Quest inspector failed. Check logs."));
  }
});


app.get("/admin/quest/:id/edit", requireGM, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return render(req, res, "Quest Editor", errorCard("Invalid quest ID."));

  try {
    const worldConn = await worldDb();

    const [quests] = await worldConn.execute("SELECT * FROM quest_template WHERE ID = ? LIMIT 1", [id]);
    if (!quests.length) {
      await worldConn.end();
      return render(req, res, "Quest Editor", errorCard("Quest not found."));
    }

    const quest = quests[0];

    const [starters] = await worldConn.execute("SELECT id FROM creature_queststarter WHERE quest = ? LIMIT 1", [id]);
    const [enders] = await worldConn.execute("SELECT id FROM creature_questender WHERE quest = ? LIMIT 1", [id]);

    await worldConn.end();

    render(req, res, `Edit ${quest.LogTitle}`, `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">GM Quest Editor</p>
            <h1>Edit Quest ${esc(quest.ID)}</h1>
            <p>Safe v1 editor. More fields come next.</p>
          </div>

          <div class="card">
            <form method="POST" action="/admin/quest/${quest.ID}/edit" onsubmit="return confirm('Save changes to quest ${esc(quest.ID)}?');">
              <label>Title</label>
              <input name="LogTitle" value="${esc(quest.LogTitle || "")}" required>

              <label>Quest Level</label>
              <input name="QuestLevel" value="${esc(quest.QuestLevel)}" required>

              <label>Minimum Level</label>
              <input name="MinLevel" value="${esc(quest.MinLevel)}" required>

              <label>Reward Money / Copper</label>
              <input name="RewardMoney" value="${esc(quest.RewardMoney)}" required>

              <label>Quest Description</label>
              <textarea name="QuestDescription" rows="6">${esc(quest.QuestDescription || "")}</textarea>

              <label>Log Description</label>
              <textarea name="LogDescription" rows="4">${esc(quest.LogDescription || "")}</textarea>

              <label>Area / Objective Description</label>
              <textarea name="AreaDescription" rows="3">${esc(quest.AreaDescription || "")}</textarea>

              <label>Completion Log</label>
              <textarea name="QuestCompletionLog" rows="3">${esc(quest.QuestCompletionLog || "")}</textarea>

              <hr>

              <label>Starter NPC Entry</label>
              <input name="starterNpc" value="${esc(starters[0]?.id || "")}" placeholder="900100">

              <label>Ender NPC Entry</label>
              <input name="enderNpc" value="${esc(enders[0]?.id || "")}" placeholder="900100">

              <hr>

              <label>Required Item 1 Entry</label>
              <input name="RequiredItemId1" value="${esc(quest.RequiredItemId1 || 0)}">

              <label>Required Item 1 Count</label>
              <input name="RequiredItemCount1" value="${esc(quest.RequiredItemCount1 || 0)}">

              <label>Guaranteed Reward Item 1 Entry</label>
              <input name="RewardItem1" value="${esc(quest.RewardItem1 || 0)}">

              <label>Guaranteed Reward Item 1 Count</label>
              <input name="RewardAmount1" value="${esc(quest.RewardAmount1 || 0)}">

              <label>Choice Reward Item 1 Entry</label>
              <input name="RewardChoiceItemID1" value="${esc(quest.RewardChoiceItemID1 || 0)}">

              <label>Choice Reward Item 1 Count</label>
              <input name="RewardChoiceItemQuantity1" value="${esc(quest.RewardChoiceItemQuantity1 || 0)}">

              <button class="btn" type="submit">Save Quest</button>
              <a class="btn secondary" href="/admin/quest/${quest.ID}">Cancel</a>
            </form>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error("quest edit page failed", err);
    render(req, res, "Quest Editor Error", errorCard("Quest editor failed."));
  }
});

app.post("/admin/quest/:id/edit", requireGM, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return render(req, res, "Quest Editor", errorCard("Invalid quest ID."));

  const cleanInt = (v) => {
    const n = Number(v || 0);
    return Number.isInteger(n) ? n : 0;
  };

  const data = {
    LogTitle: String(req.body.LogTitle || "").trim(),
    QuestLevel: cleanInt(req.body.QuestLevel),
    MinLevel: cleanInt(req.body.MinLevel),
    RewardMoney: cleanInt(req.body.RewardMoney),
    QuestDescription: String(req.body.QuestDescription || ""),
    LogDescription: String(req.body.LogDescription || ""),
    AreaDescription: String(req.body.AreaDescription || ""),
    QuestCompletionLog: String(req.body.QuestCompletionLog || ""),
    RequiredItemId1: cleanInt(req.body.RequiredItemId1),
    RequiredItemCount1: cleanInt(req.body.RequiredItemCount1),
    RewardItem1: cleanInt(req.body.RewardItem1),
    RewardAmount1: cleanInt(req.body.RewardAmount1),
    RewardChoiceItemID1: cleanInt(req.body.RewardChoiceItemID1),
    RewardChoiceItemQuantity1: cleanInt(req.body.RewardChoiceItemQuantity1),
    starterNpc: cleanInt(req.body.starterNpc),
    enderNpc: cleanInt(req.body.enderNpc),
  };

  if (!data.LogTitle) return render(req, res, "Quest Editor", errorCard("Quest title is required."));

  const worldConn = await worldDb();
  const authConn = await authDb();

  try {
    await worldConn.beginTransaction();

    await worldConn.execute(
      `UPDATE quest_template
       SET LogTitle = ?, QuestLevel = ?, MinLevel = ?, RewardMoney = ?,
           QuestDescription = ?, LogDescription = ?, AreaDescription = ?, QuestCompletionLog = ?,
           RequiredItemId1 = ?, RequiredItemCount1 = ?,
           RewardItem1 = ?, RewardAmount1 = ?,
           RewardChoiceItemID1 = ?, RewardChoiceItemQuantity1 = ?
       WHERE ID = ?`,
      [
        data.LogTitle, data.QuestLevel, data.MinLevel, data.RewardMoney,
        data.QuestDescription, data.LogDescription, data.AreaDescription, data.QuestCompletionLog,
        data.RequiredItemId1, data.RequiredItemCount1,
        data.RewardItem1, data.RewardAmount1,
        data.RewardChoiceItemID1, data.RewardChoiceItemQuantity1,
        id
      ]
    );

    await worldConn.execute("DELETE FROM creature_queststarter WHERE quest = ?", [id]);
    if (data.starterNpc > 0) {
      await worldConn.execute("INSERT INTO creature_queststarter (id, quest) VALUES (?, ?)", [data.starterNpc, id]);
    }

    await worldConn.execute("DELETE FROM creature_questender WHERE quest = ?", [id]);
    if (data.enderNpc > 0) {
      await worldConn.execute("INSERT INTO creature_questender (id, quest) VALUES (?, ?)", [data.enderNpc, id]);
    }

    await worldConn.commit();

    await authConn.execute(
      "INSERT INTO ft_admin_log (account_id, username, action, details) VALUES (?, ?, ?, ?)",
      [req.user.id, req.user.username, "QUEST_EDIT", `Quest=${id}; Title=${data.LogTitle}`]
    );

    res.redirect(`/admin/quest/${id}`);
  } catch (err) {
    try { await worldConn.rollback(); } catch {}
    console.error("quest save failed", err);
    render(req, res, "Quest Editor Error", errorCard("Saving quest failed. Check logs."));
  } finally {
    await worldConn.end();
    await authConn.end();
  }
});



app.get("/admin/realm/switch", requireGM, async (req, res) => {
  const key = String(req.query.realm || "").trim();
  const configs = await loadRealmConfigs();
  const found = configs.find(r => r.realm_key === key || String(r.realm_id) === key);

  if (!found) {
    return render(req, res, "Realm Switch", errorCard("Realm not found."));
  }

  res.cookie("ft_active_realm", found.realm_key, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30
  });

  res.redirect(req.query.next || "/admin");
});

app.get("/admin/logs", requireGM, async (req, res) => {
  try {
    const authConn = await authDb();

    const [logs] = await authConn.execute(
      `SELECT id, account_id, username, action, details, created_at
       FROM ft_admin_log
       ORDER BY id DESC
       LIMIT 200`
    );

    await authConn.end();

    const rows = logs.map(l => `
      <tr>
        <td>${esc(l.id)}</td>
        <td>${esc(l.created_at)}</td>
        <td><a href="/admin/account/${l.account_id}">${esc(l.username)}</a></td>
        <td><strong>${esc(l.action)}</strong></td>
        <td>${esc(l.details || "")}</td>
      </tr>
    `).join("");

    render(req, res, "Activity Log", `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">FrozenThrone OS</p>
            <h1>Activity Log</h1>
            <p>Recent GM/backend actions. This is the audit trail for the Control Center.</p>
          </div>

          <div class="card">
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>Time</th><th>GM</th><th>Action</th><th>Details</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="5">No activity logged yet.</td></tr>`}</tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <a class="btn secondary" href="/admin">Back to Control Center</a>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error("activity log failed", err);
    render(req, res, "Activity Log Error", errorCard("Activity log failed. Check logs."));
  }
});

app.get(["/shop", "/shop.html"], requireLogin, (req, res) => {
  render(req, res, "Shop", `<main class="container"><section>
    <div class="section-head"><p class="eyebrow">Coming Soon</p><h1>FrozenThrone Shop</h1><p>The shop is account-protected now. Reward delivery logic will be added after vote tokens are finished.</p></div>
    <div class="grid grid-4">
      <div class="card"><h3>Mounts</h3><p class="muted">Future cosmetic mounts.</p><a class="btn secondary disabled">Coming Soon</a></div>
      <div class="card"><h3>Pets</h3><p class="muted">Companion pets and fun extras.</p><a class="btn secondary disabled">Coming Soon</a></div>
      <div class="card"><h3>Cosmetics</h3><p class="muted">Visual items and vanity rewards.</p><a class="btn secondary disabled">Coming Soon</a></div>
      <div class="card"><h3>Vote Rewards</h3><p class="muted">Spend earned vote tokens here later.</p><a class="btn gold disabled">Coming Soon</a></div>
    </div>
  </section></main>`);
});

app.get("/vote", requireLogin, (req, res) => {
  render(req, res, "Vote", `<main class="container"><section>
    <div class="section-head"><p class="eyebrow">Vote System Foundation</p><h1>Vote Rewards</h1><p>This page is protected by account login and ready for TopG vote cooldowns and token rewards.</p></div>
    <div class="grid grid-2">
      <div class="card highlight"><h3>TopG Vote</h3><p class="muted">Voting link and callback tracking will be connected here.</p><a class="btn secondary disabled">Coming Soon</a></div>
      <div class="card"><h3>Reward Balance</h3><p class="muted">Vote token balance will show here after the reward table is created.</p><div class="stat"><strong>Soon</strong><span>Vote Tokens</span></div></div>
    </div>
  </section></main>`);
});


app.get(["/guilds", "/guilds.html"], async (req, res) => {
  try {
    const realm = getRealm(req.query.realm || "main") || getRealm("main");
    const dbName = realm.characters_db || realm.db || "characters";
    const conn = await characterDb(dbName);

    const [guilds] = await conn.execute(`
      SELECT 
        g.guildid,
        g.name,
        g.leaderguid,
        g.createdate,
        c.name AS leaderName,
        COUNT(gm.guid) AS members
      FROM guild g
      LEFT JOIN characters c ON c.guid = g.leaderguid
      LEFT JOIN guild_member gm ON gm.guildid = g.guildid
      GROUP BY g.guildid, g.name, g.leaderguid, g.createdate, c.name
      ORDER BY members DESC, g.name ASC
    `);

    await conn.end();

    const rows = guilds.map(g => `
      <tr>
        <td><strong>${esc(g.name)}</strong></td>
        <td>${esc(g.leaderName || "Unknown")}</td>
        <td>${esc(g.members)}</td>
        <td>${esc(g.guildid)}</td>
      </tr>
    `).join("");

    render(req, res, "Guilds | FrozenThrone Armory", `
      <main class="container">
        <section>
          <div class="section-head">
            <p class="eyebrow">${esc(realm.name || realm.realm_key || "Main")} Realm</p>
            <h1>Guilds</h1>
            <p>Browse active guilds on FrozenThrone.</p>
          </div>

          <div class="card">
            <h3>Guild Directory</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Guild</th>
                    <th>Guild Master</th>
                    <th>Members</th>
                    <th>Guild ID</th>
                  </tr>
                </thead>
                <tbody>${rows || `<tr><td colspan="4">No guilds found.</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    `);
  } catch (err) {
    console.error(err);
    render(req, res, "Guilds Error", errorCard("Guild page failed. Check website.log or journal logs."));
  }
});


app.get(["/players", "/players.html"], async (req, res) => {
  try {
    const conn = await characterDb("characters");

    const publicWhere = `
      FROM characters c
      LEFT JOIN auth.account_access aa
        ON aa.AccountID = c.account AND aa.RealmID IN (-1, 0)
      WHERE (c.deleteDate IS NULL OR c.deleteDate = 0)
        AND COALESCE(aa.SecurityLevel, 0) <= 2
    `;

    const [topLevel] = await conn.execute(`
      SELECT c.name, c.level, c.class
      ${publicWhere}
      ORDER BY c.level DESC, c.xp DESC
      LIMIT 10
    `);

    const [topGold] = await conn.execute(`
      SELECT c.name, c.money
      ${publicWhere}
      ORDER BY c.money DESC
      LIMIT 10
    `);

    const [topKills] = await conn.execute(`
      SELECT c.name, c.totalKills
      ${publicWhere}
      ORDER BY c.totalKills DESC
      LIMIT 10
    `);

    const [onlineNow] = await conn.execute(`
      SELECT c.name, c.level, c.class
      ${publicWhere}
        AND c.online = 1
      ORDER BY c.level DESC
    `);

    await conn.end();

    const table = (title, rows, cols) => `<div class="card"><h3>${title}</h3><div class="table-wrap"><table class="rank-table"><tbody>${rows.length ? rows.map((r, i) => `<tr><td>#${i + 1}</td>${cols.map(c => `<td>${c(r)}</td>`).join("")}</tr>`).join("") : `<tr><td class="muted">No data yet.</td></tr>`}</tbody></table></div></div>`;
    render(req, res, "Players | FrozenThrone Armory", `<main class="container"><section>
      <div class="section-head"><h1>Player Rankings</h1><p>Live rankings pulled from the FrozenThrone production realm.</p></div>
      <div class="grid grid-2">
        ${table("Top Level", topLevel, [r => esc(r.name), r => `Level ${r.level}`, r => className(r.class)])}
        ${table("Top Gold", topGold, [r => esc(r.name), r => `${moneyToGold(r.money)}g`])}
        ${table("Top Kills", topKills, [r => esc(r.name), r => `${r.totalKills || 0} kills`])}
        ${table("Online Now", onlineNow, [r => esc(r.name), r => `Level ${r.level}`, r => className(r.class)])}
      </div>
    </section></main>`);
  } catch (err) {
    console.error(err);
    render(req, res, "Players", errorCard("Player rankings failed. Check server logs."));
  }
});

app.get("/stats", async (req, res) => {
  try {
    const authConn = await authDb();
    const charConn = await characterDb("characters");
    const [accounts] = await authConn.execute("SELECT COUNT(*) AS total FROM account");
    const [characters] = await charConn.execute(`
      SELECT COUNT(*) AS total
      FROM characters c
      LEFT JOIN auth.account_access aa
        ON aa.AccountID = c.account AND aa.RealmID IN (-1, 0)
      WHERE COALESCE(aa.SecurityLevel, 0) <= 2
    `);
    const [online] = await charConn.execute(`
      SELECT COUNT(*) AS total
      FROM characters c
      LEFT JOIN auth.account_access aa
        ON aa.AccountID = c.account AND aa.RealmID IN (-1, 0)
      WHERE c.online = 1
        AND COALESCE(aa.SecurityLevel, 0) <= 2
    `);
    const [uptime] = await authConn.execute("SELECT uptime FROM uptime ORDER BY starttime DESC LIMIT 1");
    let betaCharacters = 0;
    if (await databaseExists("characters_beta")) {
      const betaConn = await characterDb("characters_beta");
      const [beta] = await betaConn.execute("SELECT COUNT(*) AS total FROM characters");
      betaCharacters = beta[0].total;
      await betaConn.end();
    }
    await authConn.end();
    await charConn.end();
    res.json({ status: uptime.length > 0 ? "Online" : "Offline", accounts: accounts[0].total, characters: characters[0].total, online: online[0].total, betaCharacters });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "stats failed" });
  }
});

app.get("/api/players", async (req, res) => {
  try {
    const conn = await characterDb("characters");

    const publicWhere = `
      FROM characters c
      LEFT JOIN auth.account_access aa
        ON aa.AccountID = c.account AND aa.RealmID IN (-1, 0)
      WHERE (c.deleteDate IS NULL OR c.deleteDate = 0)
        AND COALESCE(aa.SecurityLevel, 0) <= 2
    `;

    const [topLevel] = await conn.execute(`
      SELECT c.name, c.level, c.class
      ${publicWhere}
      ORDER BY c.level DESC, c.xp DESC
      LIMIT 10
    `);

    const [topGold] = await conn.execute(`
      SELECT c.name, c.money
      ${publicWhere}
      ORDER BY c.money DESC
      LIMIT 10
    `);

    const [topKills] = await conn.execute(`
      SELECT c.name, c.totalKills
      ${publicWhere}
      ORDER BY c.totalKills DESC
      LIMIT 10
    `);

    const [onlineNow] = await conn.execute(`
      SELECT c.name, c.level
      ${publicWhere}
        AND c.online = 1
      ORDER BY c.level DESC
    `);

    await conn.end();
    res.json({ topLevel, topGold, topKills, onlineNow });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "players failed" });
  }
});

function errorCard(message) {
  return `<main class="container"><section><div class="card highlight form"><h1>Notice</h1><p class="lead">${esc(message)}</p><a class="btn secondary" href="javascript:history.back()">Go Back</a></div></section></main>`;
}



app.get("/armory-portrait/:realm/:guid", async (req, res) => {
  const realm = String(req.params.realm || "main").replace(/[^a-zA-Z0-9_-]/g, "");
  const guid = String(req.params.guid || "").replace(/[^0-9]/g, "");

  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;}
    #portrait3d{position:absolute;inset:-35px -30px -10px -30px;}
    canvas{width:100%!important;height:100%!important;}
  </style>
  <script src="https://code.jquery.com/jquery-3.5.1.min.js"></script>
  <script src="/modelviewer/live/viewer/viewer.min.js"></script>
</head>
<body>
  <div id="portrait3d"></div>
  <script type="module">
    import { generateModels, findItemsInEquipments } from "/vendor/wow-model-viewer/index.js?v=portrait1";

    window.CONTENT_PATH = "/modelviewer/live/";
    window.WOTLK_TO_RETAIL_DISPLAY_ID_API = "/wotlk-items";

    async function loadPortrait() {
      const character = await fetch("/api/armory-viewer/${realm}/${guid}").then(r => r.json());
      if (character.equipments) {
        character.items = await findItemsInEquipments(character.equipments);
      }

      const viewer = await generateModels(1.15, "#portrait3d", character, "live");

      if (character.items) {
        for (const pair of character.items) viewer.updateItemViewer(pair[0], pair[1], 0);
      }

      viewer.setDistance(2.25);
      viewer.setAzimuth(0);
      viewer.setZenith(1.25);
      try { viewer.setAnimPaused(true); } catch(e) {}

      setInterval(() => {
        try {
          viewer.setDistance(2.25);
          viewer.setAzimuth(0);
          viewer.setZenith(1.25);
          try { viewer.setAnimPaused(true); } catch(e) {}
        } catch(e) {}
      }, 400);
    }

    loadPortrait();
  </script>
</body>
</html>`);
});


app.get("/api/armory-viewer/:realm/:guid", async (req, res) => {
  try {
    const { execFileSync } = require("child_process");
    const fs = require("fs");

    const realm = String(req.params.realm || "main").replace(/[^a-zA-Z0-9_-]/g, "");
    const guid = String(req.params.guid || "").replace(/[^0-9]/g, "");

    if (!guid) return res.status(400).json({ error: "Missing guid" });

    const root = "/var/www/frozenthrone";
    const input = `${root}/public/renders/input/character-${guid}.json`;
    const manifest = `${root}/public/renders/manifests/character-${guid}.json`;
    const out = `${root}/public/renders/manifests/character-${realm}-${guid}-wowviewer.json`;

    const maxAgeMs = 24 * 60 * 60 * 1000;

    let fresh = false;
    if (fs.existsSync(out)) {
      const age = Date.now() - fs.statSync(out).mtimeMs;
      fresh = age < maxAgeMs;
    }

    if (!fresh) {
      execFileSync("node", ["modules/renderer/build-character-input.js", guid, realm], { cwd: root });
      execFileSync("node", ["modules/renderer/render-character.js", input], { cwd: root });
      execFileSync("node", ["modules/renderer/engine/export-wowviewer.js", manifest, out], { cwd: root });
    }

    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(JSON.parse(fs.readFileSync(out, "utf8")));
  } catch (err) {
    console.error("Armory viewer API failed:", err);
    res.status(500).json({ error: "viewer_failed", message: err.message });
  }
});


app.use((req, res) => {
  res.status(404);
  render(req, res, "Not Found", `<main class="container"><section><div class="card highlight form"><h1>Page Not Found</h1><p class="muted">That page does not exist.</p><a class="btn" href="/">Return Home</a></div></section></main>`);
});

app.listen(PORT, () => {
  console.log(`FrozenThrone website running on port ${PORT}`);
});
