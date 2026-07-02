const RACES = {
  1: { name: "Human", file: "human" },
  2: { name: "Orc", file: "orc" },
  3: { name: "Dwarf", file: "dwarf" },
  4: { name: "Night Elf", file: "night-elf" },
  5: { name: "Undead", file: "undead" },
  6: { name: "Tauren", file: "tauren" },
  7: { name: "Gnome", file: "gnome" },
  8: { name: "Troll", file: "troll" },
  10:{ name: "Blood Elf", file: "blood-elf" },
  11:{ name: "Draenei", file: "draenei" }
};

function getRaceInfo(id){
    return RACES[id] || {
        name:"Unknown",
        file:"default"
    };
}

module.exports={
    getRaceInfo
};
