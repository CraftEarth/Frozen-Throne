const fs = require("fs");
const path = require("path");

const COMMUNITY_DIR = path.join(__dirname, "../../../data/community");
const FORUM_FILE = path.join(COMMUNITY_DIR, "forum.json");

const DEFAULT_FORUM = {
  categories: [
    {
      id: 1,
      name: "FrozenThrone",
      description: "Official server discussion.",
      boards: [
        { id: 1, categoryId: 1, name: "Announcements", description: "Official news and staff updates.", locked: true },
        { id: 2, categoryId: 1, name: "General Discussion", description: "Talk about the realm, players, and server life.", locked: false },
        { id: 3, categoryId: 1, name: "Help & Questions", description: "Ask for help with quests, gear, classes, and accounts.", locked: false }
      ]
    },
    {
      id: 2,
      name: "Gameplay",
      description: "Game systems, dungeons, PvP, and guilds.",
      boards: [
        { id: 4, categoryId: 2, name: "PvP", description: "Battlegrounds, arena, duels, and rivalries.", locked: false },
        { id: 5, categoryId: 2, name: "Guild Recruitment", description: "Find a guild or recruit players.", locked: false },
        { id: 6, categoryId: 2, name: "Dungeons & Raids", description: "Groups, boss kills, loot, and raid planning.", locked: false }
      ]
    }
  ],
  threads: [],
  replies: [],
  reactions: []
};

function ensureForumStore() {
  fs.mkdirSync(COMMUNITY_DIR, { recursive: true });

  if (!fs.existsSync(FORUM_FILE)) {
    fs.writeFileSync(FORUM_FILE, JSON.stringify(DEFAULT_FORUM, null, 2));
  }
}

function readForum() {
  ensureForumStore();

  try {
    return JSON.parse(fs.readFileSync(FORUM_FILE, "utf8"));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_FORUM));
  }
}

function writeForum(data) {
  ensureForumStore();
  fs.writeFileSync(FORUM_FILE, JSON.stringify(data, null, 2));
}

function nextId(items) {
  return items.length ? Math.max(...items.map(x => Number(x.id) || 0)) + 1 : 1;
}

function cleanText(value) {
  return String(value || "").trim();
}

function stripHtml(value) {
  return cleanText(value).replace(/<[^>]*>/g, "");
}

module.exports = {
  readForum,
  writeForum,
  nextId,
  cleanText,
  stripHtml
};
