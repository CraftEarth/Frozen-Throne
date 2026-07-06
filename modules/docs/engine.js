const fs = require("fs");
const path = require("path");

const DOCS_DIR = path.join(__dirname, "../../docs");

const ALLOWED_DOCS = [
  "PROJECT.md",
  "BIBLE.md",
  "ROADMAP.md",
  "CHANGELOG.md",
  "ARCHITECTURE.md"
];

function listDocs() {
  return ALLOWED_DOCS.filter(file => fs.existsSync(path.join(DOCS_DIR, file)));
}

function readDoc(file) {
  if (!ALLOWED_DOCS.includes(file)) throw new Error("Invalid doc");
  return fs.readFileSync(path.join(DOCS_DIR, file), "utf8");
}

function writeDoc(file, content) {
  if (!ALLOWED_DOCS.includes(file)) throw new Error("Invalid doc");
  fs.writeFileSync(path.join(DOCS_DIR, file), String(content || ""));
}

module.exports = {
  listDocs,
  readDoc,
  writeDoc
};
