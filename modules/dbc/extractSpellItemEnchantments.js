const fs = require("fs");

function readCString(buf, start) {
  let end = start;
  while (end < buf.length && buf[end] !== 0) end++;
  return buf.toString("utf8", start, end);
}

function extractSpellItemEnchantments(dbcPath) {
  const buf = fs.readFileSync(dbcPath);

  const magic = buf.toString("ascii", 0, 4);
  if (magic !== "WDBC") {
    throw new Error(`Invalid DBC magic: ${magic}`);
  }

  const recordCount = buf.readUInt32LE(4);
  const fieldCount = buf.readUInt32LE(8);
  const recordSize = buf.readUInt32LE(12);
  const stringBlockSize = buf.readUInt32LE(16);

  const recordsOffset = 20;
  const stringBlockOffset = recordsOffset + recordCount * recordSize;
  const stringBlock = buf.subarray(stringBlockOffset, stringBlockOffset + stringBlockSize);

  const output = {};

  for (let row = 0; row < recordCount; row++) {
    const rowOffset = recordsOffset + row * recordSize;
    const fields = [];

    for (let field = 0; field < fieldCount; field++) {
      fields.push(buf.readUInt32LE(rowOffset + field * 4));
    }

    const id = fields[0];

    // WotLK SpellItemEnchantment.dbc:
    // field 14 is usually the first localized name string offset.
    const nameOffset = fields[14] || 0;
    const name = nameOffset ? readCString(stringBlock, nameOffset) : "";

    output[id] = {
      id,
      name,
      raw: fields
    };
  }

  return output;
}

if (require.main === module) {
  const dbcPath = process.argv[2] || "/opt/trinity/bin/dbc/SpellItemEnchantment.dbc";
  const outPath = process.argv[3] || "public/data/spell-item-enchantments.json";

  const data = extractSpellItemEnchantments(dbcPath);

  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

  console.log(`Extracted ${Object.keys(data).length} enchantments`);
  console.log(`Wrote ${outPath}`);

  for (const id of [1201, 1324, 1370, 1416, 1462, 1508, 3307, 3354, 3357, 3766]) {
    if (data[id]) {
      console.log(id, "=>", data[id].name || "(no name)");
    }
  }
}

module.exports = {
  extractSpellItemEnchantments
};
