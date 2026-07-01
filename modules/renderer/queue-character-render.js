require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const guid = Number(process.argv[2]);
const realm = process.argv[3] || "main";

if (!guid) {
  console.error("Usage: node modules/renderer/queue-character-render.js <guid> [main|beta]");
  process.exit(1);
}

execFileSync("node", ["modules/renderer/build-character-input.js", String(guid), realm], {
  cwd: "/var/www/frozenthrone",
  stdio: "inherit"
});

const inputFile = `/var/www/frozenthrone/public/renders/input/character-${guid}.json`;
const queueDir = "/var/www/frozenthrone/public/renders/queue";
fs.mkdirSync(queueDir, { recursive: true });

const job = {
  type: "character-render",
  guid,
  realm,
  inputFile,
  queuedAt: new Date().toISOString()
};

const jobFile = path.join(queueDir, `character-${guid}-${Date.now()}.json`);
fs.writeFileSync(jobFile, JSON.stringify(job, null, 2));

console.log(`Render job queued: ${jobFile}`);
