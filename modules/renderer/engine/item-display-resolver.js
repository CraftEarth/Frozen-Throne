const DbcReader = require("./dbc-reader");

class ItemDisplayResolver {
  constructor(dbcPath = "/opt/trinity/bin/dbc/ItemDisplayInfo.dbc") {
    this.dbc = new DbcReader(dbcPath);
  }

  resolve(displayId) {
    const rec = this.dbc.findById(displayId);
    if (!rec) return null;

    return {
      displayId: rec[0],
      model: this.dbc.getString(rec[1]) || "",
      model2: this.dbc.getString(rec[3]) || "",
      texture: this.dbc.getString(rec[5]) || "",
      icon: this.dbc.getString(rec[6]) || this.dbc.getString(rec[5]) || ""
    };
  }
}

module.exports = ItemDisplayResolver;
