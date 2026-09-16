// Runs the real sprite-alignment.js in Node with a minimal canvas shim, so the
// numbers it produces can be checked without a browser.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

function decodePng(file) {
  if (file.endsWith('.webp')) {
    execFileSync('dwebp', [file, '-quiet', '-o', '/tmp/mascot-check-decoded.png']);
    file = '/tmp/mascot-check-decoded.png';
  }
  const data = readFileSync(file);
  let pos = 8, idat = [], meta = null;
  while (pos < data.length) {
    const length = data.readUInt32BE(pos);
    const type = data.toString('ascii', pos + 4, pos + 8);
    const body = data.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      const depth = body[8], colour = body[9], interlace = body[12];
      if (depth !== 8 || interlace !== 0) throw new Error('unsupported png');
      meta = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), channels: { 0: 1, 2: 3, 4: 2, 6: 4 }[colour] };
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const { width, height, channels } = meta;
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { width, height, channels, pixels: out };
}

const root = new URL('..', import.meta.url).pathname;

globalThis.Image = class {
  set src(value) {
    const { width, height, channels, pixels } = decodePng(root + value);
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.pixels = pixels;
    this.channels = channels;
  }
  async decode() {}
};
globalThis.document = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({
      drawImage(image) {
        this.image = image;
      },
      getImageData(_x, _y, width, height) {
        const { pixels, channels } = this.image;
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i++) {
          if (channels === 4) {
            rgba[i * 4] = pixels[i * 4];
            rgba[i * 4 + 1] = pixels[i * 4 + 1];
            rgba[i * 4 + 2] = pixels[i * 4 + 2];
            rgba[i * 4 + 3] = pixels[i * 4 + 3];
          } else {
            rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = pixels[i * channels];
            rgba[i * 4 + 3] = channels === 2 ? pixels[i * 2 + 1] : 255;
          }
        }
        return { data: rgba };
      }
    })
  })
};

// .js is CommonJS to Node, so load the module through a .mjs copy.
const source = readFileSync(root + 'sprite-alignment.js', 'utf8');
const copy = '/tmp/sprite-alignment.mjs';
writeFileSync(copy, source);
const { registerSprites, applyFrame } = await import(pathToFileURL(copy).href);

const VIEW = 260;
const id = process.argv[2] || 'cat';
const data = await registerSprites(true, id === 'astronaut' ? null : { directions: `${id}-directions-25.webp`, reactions: `${id}-reactions.webp` });
if (data.missing.length) console.log(`missing: ${data.missing.join(', ')}`);
for (const [name, frames] of Object.entries(data.frames)) {
  const first = frames[0];
  console.log(`${name}: pad=${first.pad} above=${first.above.toFixed(1)} half=${first.half.toFixed(1)} zoom=${first.zoom.toFixed(4)}`);
  for (const frame of frames) {
    const layer = { style: {}, getBoundingClientRect: () => ({ width: VIEW }) };
    applyFrame(layer, frame);
    console.log(`  ${String(frame.cell).padStart(2)}: cx=${frame.cx.toFixed(1)} floor=${frame.floor} `
      + `shoulder=${frame.shoulderWidth} | ${layer.style.backgroundSize} | ${layer.style.backgroundPosition} | ${layer.style.clipPath}`);
  }
}

let checked = 0;
for (const group of Object.values(data.frames)) for (const frame of group) {
  const layer = { style: {}, offsetWidth: VIEW };
  applyFrame(layer, frame);
  const clip = [...layer.style.clipPath.matchAll(/([\d.]+)px/g)].map(m => Number(m[1]));
  const z = VIEW * frame.zoom;
  const top = VIEW * .93 + (frame.top - frame.floor) * z;
  const left = VIEW / 2 + (frame.left - frame.cx) * z;
  const right = VIEW / 2 + (frame.right - frame.cx) * z;
  const bottom = VIEW * .93 + (frame.bottom - frame.floor) * z;
  if (top < clip[0] - .01 || left < clip[3] - .01 || right > VIEW - clip[1] + .01 || bottom > VIEW - clip[2] + .01) throw new Error(`Clipped frame ${frame.cell}`);
  if (VIEW * .93 + (top - VIEW * .93) * 1.08 < 0) throw new Error(`Bounce clips frame ${frame.cell}`);
  checked++;
}
console.log(`PASS: ${checked} frame entries retain measured content and bounce headroom`);
