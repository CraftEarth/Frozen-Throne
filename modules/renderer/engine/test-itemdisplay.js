const DbcReader = require("./dbc-reader");

const dbc = new DbcReader("/opt/trinity/bin/dbc/ItemDisplayInfo.dbc");
const id = Number(process.argv[2] || 64587);
const rec = dbc.findById(id);

console.log("DisplayID:", id);
console.log("Record:", rec);
if (rec) {
  console.log("Possible strings:");
  for (const v of rec) {
    const str = dbc.getString(v);
    if (str) console.log(v, str);
  }
}
