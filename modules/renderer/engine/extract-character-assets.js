const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const AssetPathResolver = require("./asset-path-resolver");

const manifestFile = process.argv[2] || "public/renders/manifests/character-24.json";
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const resolver = new AssetPathResolver();

const mpqMap = {
  "common": "/home/wowclient/Data/common.MPQ",
  "common-2": "/home/wowclient/Data/common-2.MPQ",
  "expansion": "/home/wowclient/Data/expansion.MPQ",
  "lichking": "/home/wowclient/Data/lichking.MPQ",
  "patch": "/home/wowclient/Data/patch.MPQ",
  "patch-2": "/home/wowclient/Data/patch-2.MPQ",
  "patch-3": "/home/wowclient/Data/patch-3.MPQ"
};

const outRoot = `/var/www/frozenthrone/public/renders/assets/character-${manifest.guid}`;
fs.mkdirSync(outRoot, { recursive: true });

function extract(found) {
  if (!found || !mpqMap[found.archive]) return false;

  try {
    execFileSync("smpq", ["-x", mpqMap[found.archive], found.file], {
      cwd: outRoot,
      stdio: "ignore"
    });
    console.log("Extracted:", found.archive, found.file);
    return true;
  } catch (err) {
    console.log("FAILED:", found.archive, found.file);
    return false;
  }
}

for (const [slot, item] of Object.entries(manifest.equipment)) {
  if (!item.asset?.model) continue;

  const model = resolver.resolveHeadModel(item.asset.model, manifest.race, manifest.gender)
    || resolver.findContains(item.asset.model.replace(/\.mdx$/i, "").replace(/\.m2$/i, ""))[0];

  console.log("\nSlot:", slot);
  console.log("Item:", item.name);
  console.log("Display:", item.displayid);
  console.log("Model search:", item.asset.model);
  extract(model);

  if (model?.file) {
    const base = model.file.replace(/\.M2$/i, "");
    const skin = resolver.findContains(base + "00.skin")[0];
    extract(skin);
  }

  if (item.asset.model2) {
    const tex = resolver.findContains(item.asset.model2 + ".blp")[0]
      || resolver.findContains(item.asset.model2)[0];
    extract(tex);
  }
}

console.log("\nDone. Output:");
console.log(outRoot);
