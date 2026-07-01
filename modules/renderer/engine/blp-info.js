const fs = require("fs");

const file = process.argv[2];
const b = fs.readFileSync(file);

console.log({
  magic: b.toString("ascii", 0, 4),
  compression: b.readUInt32LE(4),
  alphaDepth: b.readUInt8(8),
  alphaEncoding: b.readUInt8(9),
  hasMips: b.readUInt8(10),
  width: b.readUInt32LE(12),
  height: b.readUInt32LE(16),
  firstMipOffset: b.readUInt32LE(20),
  firstMipSize: b.readUInt32LE(84)
});
