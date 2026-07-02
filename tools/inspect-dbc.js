const fs = require("fs");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node tools/inspect-dbc.js /path/file.dbc");
  process.exit(1);
}

const buf = fs.readFileSync(file);

const magic = buf.toString("ascii", 0, 4);
const recordCount = buf.readUInt32LE(4);
const fieldCount = buf.readUInt32LE(8);
const recordSize = buf.readUInt32LE(12);
const stringBlockSize = buf.readUInt32LE(16);

console.log({
  file,
  magic,
  recordCount,
  fieldCount,
  recordSize,
  stringBlockSize
});
