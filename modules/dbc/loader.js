const fs = require("fs");

function readString(buf, stringStart, offset) {
  if (!offset) return "";

  let i = stringStart + Number(offset);
  let out = "";

  while (i < buf.length && buf[i] !== 0) {
    out += String.fromCharCode(buf[i++]);
  }

  return out;
}

function readDbc(filePath) {
  const buf = fs.readFileSync(filePath);

  const magic = buf.toString("ascii", 0, 4);
  if (magic !== "WDBC") {
    throw new Error(`Invalid DBC file: ${filePath}`);
  }

  const records = buf.readUInt32LE(4);
  const fields = buf.readUInt32LE(8);
  const recordSize = buf.readUInt32LE(12);
  const stringBlockSize = buf.readUInt32LE(16);

  const dataStart = 20;
  const stringStart = dataStart + records * recordSize;

  const rows = [];

  for (let r = 0; r < records; r++) {
    const base = dataStart + r * recordSize;
    const values = [];

    for (let f = 0; f < fields; f++) {
      values.push(buf.readUInt32LE(base + f * 4));
    }

    rows.push(values);
  }

  return {
    filePath,
    magic,
    records,
    fields,
    recordSize,
    stringBlockSize,
    stringStart,
    rows,
    string: offset => readString(buf, stringStart, offset)
  };
}

module.exports = {
  readDbc,
  readString
};
