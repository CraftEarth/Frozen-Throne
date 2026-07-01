const fs = require("fs");

class DbcReader {
  constructor(file) {
    this.file = file;
    this.buffer = fs.readFileSync(file);

    this.magic = this.buffer.toString("ascii", 0, 4);
    if (this.magic !== "WDBC") {
      throw new Error(`${file} is not WDBC`);
    }

    this.records = this.buffer.readUInt32LE(4);
    this.fields = this.buffer.readUInt32LE(8);
    this.recordSize = this.buffer.readUInt32LE(12);
    this.stringBlockSize = this.buffer.readUInt32LE(16);

    this.recordsOffset = 20;
    this.stringBlockOffset = this.recordsOffset + (this.records * this.recordSize);
  }

  getRecord(index) {
    const offset = this.recordsOffset + index * this.recordSize;
    const values = [];

    for (let i = 0; i < this.fields; i++) {
      values.push(this.buffer.readUInt32LE(offset + i * 4));
    }

    return values;
  }

  getString(offset) {
    if (!offset) return "";
    const start = this.stringBlockOffset + offset;
    let end = start;

    while (end < this.buffer.length && this.buffer[end] !== 0) {
      end++;
    }

    return this.buffer.toString("utf8", start, end);
  }

  findById(id) {
    for (let i = 0; i < this.records; i++) {
      const rec = this.getRecord(i);
      if (rec[0] === Number(id)) return rec;
    }
    return null;
  }
}

module.exports = DbcReader;
