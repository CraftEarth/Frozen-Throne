const fs = require("fs");
const path = require("path");

const CONTENT_DIR = path.join(__dirname, "../../data/news");
const POSTS_FILE = path.join(CONTENT_DIR, "posts.json");

const CONTENT_TYPES = [
  "News",
  "Patch Notes",
  "Events",
  "Maintenance",
  "Community Spotlight",
  "Screenshots",
  "Guides"
];

function ensureStore() {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });

  if (!fs.existsSync(POSTS_FILE)) {
    fs.writeFileSync(POSTS_FILE, "[]");
  }
}

function readPosts() {
  ensureStore();

  try {
    return JSON.parse(fs.readFileSync(POSTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writePosts(posts) {
  ensureStore();
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

module.exports = {
  CONTENT_TYPES,
  readPosts,
  writePosts,
  slugify
};
