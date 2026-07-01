const fs = require("fs");
const path = require("path");

const guid = process.argv[2] || "24";
const manifestPath = `/var/www/frozenthrone/public/renders/manifests/character-${guid}.json`;
const assetRoot = `/var/www/frozenthrone/public/renders/assets/character-${guid}`;
const outPath = `/var/www/frozenthrone/public/renders/assets/character-${guid}-assets.json`;

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  let files = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) files = files.concat(walk(full));
    else files.push(full);
  }
  return files;
}

const files = walk(assetRoot).map(f => ({
  full: f,
  relative: f.replace(assetRoot + "/", ""),
  ext: path.extname(f).toLowerCase(),
  size: fs.statSync(f).size
}));

const report = {
  character: {
    guid: manifest.guid,
    name: manifest.name,
    race: manifest.race,
    gender: manifest.gender,
    className: manifest.className
  },
  summary: {
    totalFiles: files.length,
    m2: files.filter(f => f.ext === ".m2").length,
    skin: files.filter(f => f.ext === ".skin").length,
    blp: files.filter(f => f.ext === ".blp").length
  },
  files,
  equipment: Object.fromEntries(
    Object.entries(manifest.equipment).map(([slot, item]) => [
      slot,
      {
        name: item.name,
        entry: item.itemEntry,
        displayid: item.displayid,
        asset: item.asset || null
      }
    ])
  )
};

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Asset report written: ${outPath}`);
console.log(report.summary);
