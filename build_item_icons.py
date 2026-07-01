import struct, json, os

dbc_path = "/opt/trinity/bin/dbc/ItemDisplayInfo.dbc"
out_path = "/var/www/frozenthrone/item-icons.json"

with open(dbc_path, "rb") as f:
    magic = f.read(4)
    if magic != b"WDBC":
        raise SystemExit(f"Not a WDBC file: {magic}")

    record_count, field_count, record_size, string_block_size = struct.unpack("<4I", f.read(16))
    records_data = f.read(record_count * record_size)
    string_block = f.read(string_block_size)

def get_string(offset):
    if offset == 0 or offset >= len(string_block):
        return ""
    end = string_block.find(b"\x00", offset)
    if end == -1:
        end = len(string_block)
    return string_block[offset:end].decode("utf-8", errors="ignore")

icons = {}

for i in range(record_count):
    rec = records_data[i * record_size:(i + 1) * record_size]
    fields = struct.unpack("<" + "I" * field_count, rec[:field_count * 4])

    display_id = fields[0]

    # In WotLK ItemDisplayInfo.dbc, icon string is commonly field 5.
    possible_offsets = [fields[x] for x in range(min(field_count, 12))]
    icon = ""

    for off in possible_offsets:
        s = get_string(off)
        if s.lower().startswith("inv_") or s.lower().startswith("spell_") or s.lower().startswith("ability_"):
            icon = s
            break

    if icon:
        icons[str(display_id)] = icon.lower()

with open(out_path, "w") as f:
    json.dump(icons, f, indent=2, sort_keys=True)

print(f"records={record_count} fields={field_count} record_size={record_size}")
print(f"icons={len(icons)}")
print(f"wrote={out_path}")
