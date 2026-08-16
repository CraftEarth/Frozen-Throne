const fs = require("fs");
const path = require("path");

const CONTENT_DIR = path.join(__dirname, "../../data/news");
const POSTS_FILE = path.join(CONTENT_DIR, "posts.json");
const CATEGORIES_FILE = path.join(CONTENT_DIR, "categories.json");

const CONTENT_TYPES = [
  "Launcher News",
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

  if (!fs.existsSync(CATEGORIES_FILE)) {
    const seeded = CONTENT_TYPES.map((name, index) => ({
      id: index + 1,
      name,
      slug: slugify(name),
      sortOrder: (index + 1) * 10,
      active: true
    }));
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(seeded, null, 2));
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

function readCategories() {
  ensureStore();
  try {
    const categories = JSON.parse(fs.readFileSync(CATEGORIES_FILE, "utf8"));
    return Array.isArray(categories) ? categories : [];
  } catch {
    return [];
  }
}

function writeCategories(categories) {
  ensureStore();
  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
}

function getContentTypes(options = {}) {
  const categories = readCategories()
    .filter(category => options.includeInactive || category.active !== false)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  return categories.map(category => category.name);
}

function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

module.exports = {
  CONTENT_TYPES,
  CATEGORIES_FILE,
  readPosts,
  writePosts,
  readCategories,
  writeCategories,
  getContentTypes,
  slugify
};
