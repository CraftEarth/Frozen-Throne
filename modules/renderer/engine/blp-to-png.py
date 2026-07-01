import sys
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1])
dst = Path(sys.argv[2])

b = src.read_bytes()

if b[0:4] != b"BLP2":
    raise SystemExit("Not BLP2")

compression = int.from_bytes(b[4:8], "little")
alpha_depth = b[8]
alpha_encoding = b[9]
width = int.from_bytes(b[12:16], "little")
height = int.from_bytes(b[16:20], "little")

mip_offsets = [int.from_bytes(b[20+i*4:24+i*4], "little") for i in range(16)]
mip_sizes = [int.from_bytes(b[84+i*4:88+i*4], "little") for i in range(16)]

if compression != 1:
    raise SystemExit(f"Only paletted BLP2 supported now. compression={compression}")

palette = b[148:148+1024]
pixel_offset = mip_offsets[0]
pixel_count = width * height
pixels = b[pixel_offset:pixel_offset + pixel_count]

alpha_offset = pixel_offset + pixel_count
alpha_bytes = b[alpha_offset:mip_offsets[0] + mip_sizes[0]]

def alpha_at(i):
    if alpha_depth == 0:
        return 255
    if alpha_depth == 1:
        byte = alpha_bytes[i // 8] if i // 8 < len(alpha_bytes) else 255
        return 255 if (byte >> (i % 8)) & 1 else 0
    if alpha_depth == 4:
        byte = alpha_bytes[i // 2] if i // 2 < len(alpha_bytes) else 255
        nib = (byte & 0x0F) if i % 2 == 0 else (byte >> 4)
        return int(nib * 17)
    if alpha_depth == 8:
        return alpha_bytes[i] if i < len(alpha_bytes) else 255
    return 255

out = []
for i, idx in enumerate(pixels):
    p = idx * 4
    blue = palette[p]
    green = palette[p + 1]
    red = palette[p + 2]
    out.append((red, green, blue, alpha_at(i)))

img = Image.new("RGBA", (width, height))
img.putdata(out)
dst.parent.mkdir(parents=True, exist_ok=True)
img.save(dst)

print(f"Converted {src} -> {dst} ({width}x{height}) alpha={alpha_depth}/{alpha_encoding}")
