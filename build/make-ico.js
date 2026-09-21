// Packs a set of PNGs into a valid multi-resolution .ico (PNG-compressed
// frames are supported by Windows Vista+, no need to re-encode as raw BMP).
const fs = require("fs");
const path = require("path");

const sizes = [16, 32, 48, 64, 128, 256];
const dir = __dirname;
const pngPaths = sizes.map((s) => path.join(dir, "icon.iconset", `icon_${s}x${s}.png`));

const pngBuffers = pngPaths.map((p, i) => {
  if (!fs.existsSync(p)) throw new Error(`missing ${p} for size ${sizes[i]}`);
  return fs.readFileSync(p);
});

const count = sizes.length;
const headerSize = 6 + count * 16;
let offset = headerSize;

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(count, 4);

const entries = [];
for (let i = 0; i < count; i++) {
  const size = sizes[i];
  const buf = pngBuffers[i];
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height (0 = 256)
  entry.writeUInt8(0, 2); // color count
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(buf.length, 8); // bytes in resource
  entry.writeUInt32LE(offset, 12); // offset
  offset += buf.length;
  entries.push(entry);
}

const out = Buffer.concat([header, ...entries, ...pngBuffers]);
fs.writeFileSync(path.join(dir, "icon.ico"), out);
console.log(`Wrote icon.ico (${out.length} bytes, ${count} sizes)`);
