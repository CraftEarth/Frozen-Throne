const fs = require("fs");

const file = process.argv[2];
const b = fs.readFileSync(file);

console.log({
  magic: b.toString("ascii", 0, 4),
  records: b.readUInt32LE(4),
  fields: b.readUInt32LE(8),
  recordSize: b.readUInt32LE(12),
  stringBlockSize: b.readUInt32LE(16)
});
