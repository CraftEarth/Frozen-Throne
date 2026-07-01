const fs = require("fs");
const path = require("path");

const raceCodes = {
  Human: "Hu",
  Orc: "Or",
  Dwarf: "Dw",
  NightElf: "Ni",
  Undead: "Sc",
  Tauren: "Ta",
  Gnome: "Gn",
  Troll: "Tr",
  BloodElf: "Be",
  Draenei: "Dr"
};

function loadIndexFiles(indexDir = "/var/www/frozenthrone/public/renders/index") {
  const files = fs.readdirSync(indexDir).filter(f => f.endsWith(".txt"));
  const rows = [];

  for (const file of files) {
    const archiveName = file.replace(".txt", "");
    const full = path.join(indexDir, file);
    const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);

    for (const line of lines) {
      const match = line.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} (.+)$/);
      if (!match) continue;
      rows.push({
        archive: archiveName,
        file: match[1].trim()
      });
    }
  }

  return rows;
}

class AssetPathResolver {
  constructor() {
    this.rows = loadIndexFiles();
  }

  findExact(name) {
    const lower = name.toLowerCase();
    return this.rows.find(r => r.file.toLowerCase() === lower) || null;
  }

  findContains(text) {
    const lower = text.toLowerCase();
    return this.rows.filter(r => r.file.toLowerCase().includes(lower));
  }

  resolveHeadModel(baseModel, race, gender) {
    const raceCode = raceCodes[race] || "";
    const genderCode = gender === "Female" ? "F" : "M";

    const clean = baseModel
      .replace(/\.mdx$/i, "")
      .replace(/\.m2$/i, "");

    const wanted = `${clean}_${raceCode}${genderCode}.M2`;

    const matches = this.findContains(wanted);
    return matches[0] || null;
  }
}

module.exports = AssetPathResolver;
