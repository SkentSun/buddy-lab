// Runtime registration of raw source art. Originals are never rewritten.
//
// Poses in these sheets do not sit exactly on the nominal grid lines - in the
// 5x5 sheet each row drifts about 10 px upwards and each column about 8 px left
// - so a frame drawn straight from "cell N of 5" shows a slice of its
// neighbour. Rather than trimming each frame against its neighbours, which only
// papers over one particular sheet, this measures the sheet once and gives every
// frame in it the same treatment:
//
//   * one zoom: shoulders keep the share they have in the reference sheet, so
//     switching grid or reacting never changes the character's size;
//   * one crop: a rect sized by the tallest and widest pose, then held back to
//     the room the sheet actually leaves between rows and columns;
//   * one anchor per frame: shoulders centred, feet on the baseline.
//
// Swap the art and only the measurements change - the rules stay put.
const OPAQUE = 128;
const FLOOR = .93;   // feet line, as a share of the box
const PAD = .02;     // breathing room around the pose, as a share of a cell
const AVATAR_SLACK = .06;  // how far a pose may reach past the rim of the avatar
const AVATAR_TARGET = .50;  // avatar pose height, as a share of its own tile
const AVATAR_BUMP = 1.35;  // how far past the fit-everything zoom poses may go
const TIMEOUT = 8000;  // a wedged request must not freeze the mascot

// Each sheet is measured on its own: if one request hangs or the art is broken,
// the sheets that did load keep their registration instead of all going dark.
export async function registerSprites(include25 = false, custom = null) {
  const jobs = custom ? { directions: [custom.directions, 5], reactions: [custom.reactions, 3] } : { directions: ['assets/legacy/directions.webp', 3], reactions: ['assets/legacy/reactions.webp', 3] };
  if (include25 && !custom) jobs.directions25 = ['assets/legacy/directions-25.webp', 5];
  const measured = await Promise.all(Object.entries(jobs).map(async ([name, [url, grid]]) => {
    try {
      return [name, await measureSheet(url, grid)];
    } catch (error) {
      console.warn(`[sprite] ${url} 测量失败：${error.message}`);
      return [name, null];
    }
  }));
  const sheets = Object.fromEntries(measured.filter(([, sheet]) => sheet));
  const missing = measured.filter(([, sheet]) => !sheet).map(([name]) => name);
  // The 3x3 directions sheet has always set the size; every other sheet matches
  // its shoulder-to-cell share, so nothing changes size between grids.
  if (!sheets.directions) throw new Error(`参考素材 assets/legacy/directions.webp 不可用${missing.length ? `（同时失败的还有 ${missing.join('、')}）` : ''}`);
  const reference = sheets.directions;
  const share = average(reference.frames, f => f.shoulderWidth) / reference.size;
  for (const sheet of Object.values(sheets)) {
    sheet.crop = plan(sheet);
    sheet.zoom = share / average(sheet.frames, f => f.shoulderWidth);
  }
  {
    // Shared fit leaves room for decorations without resizing on a click.
    const fit = Math.min(1, ...Object.values(sheets).flatMap(sheet => [
      .82 / (sheet.crop.above * sheet.zoom), .44 / (sheet.crop.half * sheet.zoom)
    ]));
    for (const sheet of Object.values(sheets)) sheet.zoom *= fit;
  }
  const frames = {};
  for (const [name, sheet] of Object.entries(sheets)) {
    frames[name] = sheet.frames.map(frame => ({ ...frame, ...sheet.crop, zoom: sheet.zoom }));
  }
  if (custom) { frames.directions25 = frames.directions; frames.directions = [0,2,4,10,12,14,20,22,24].map(i => frames.directions25[i]); }
  return { frames, missing };
}

const average = (list, pick) => list.reduce((sum, item) => sum + pick(item), 0) / list.length;

// The same three rules, sized for a square tile instead of the stage: nothing
// is centred on a reference sheet here, each avatar simply fits its own tile,
// so dropping in a new character needs no measurement of the others.
//
// Sizing is anchored on the front pose, not on the widest of all 25: props held
// low at the sides (pom-poms) sit farthest from the tile centre and used to
// shrink their whole character next to cast members with narrow feet. The front
// pose is what people actually compare, so it sets one shared size; extreme
// side poses may then graze the tile edge, capped by AVATAR_BUMP.
export async function avatarFrames(url, grid = 5) {
  const sheet = await measureSheet(url, grid);
  const crop = plan(sheet);
  // Fit-everything zoom: every pose's corners stay within the tile (plus a
  // little slack). Kept as the safety base that AVATAR_BUMP grows from.
  const reach = (frame, zoom) => {
    const left = .5 + (frame.left - frame.cx) * zoom;
    const right = .5 + (frame.right - frame.cx) * zoom;
    const top = FLOOR + (frame.top - frame.floor) * zoom;
    const bottom = FLOOR + (frame.bottom - frame.floor) * zoom;
    return Math.max(Math.hypot(left - .5, top - .5), Math.hypot(right - .5, top - .5),
                    Math.hypot(left - .5, bottom - .5), Math.hypot(right - .5, bottom - .5)) - .5;
  };
  let low = 0, high = Math.min(FLOOR / crop.above, 1 / (2 * crop.half));
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (Math.max(...sheet.frames.map(frame => reach(frame, middle))) > AVATAR_SLACK) high = middle;
    else low = middle;
  }
  // One shared size: the front pose fills AVATAR_TARGET of the tile, unless it
  // is too wide to fit or that would stretch the extreme poses past repair.
  const front = sheet.frames[Math.floor(grid * grid / 2)];
  const zoom = Math.min(
    AVATAR_TARGET / (front.floor - front.top),
    .5 / Math.max(front.right - front.cx, front.cx - front.left),
    low * AVATAR_BUMP
  );
  // A small pose on the 93% feet line floats in the top half of its tile:
  // centre the cast vertically instead, on a baseline set by the front pose.
  const floorLine = (1 + (front.floor - front.top) * zoom) / 2;
  return sheet.frames.map(frame => ({ ...frame, ...crop, zoom, floorLine }));
}

export async function measureSheet(url, grid = 3) {
  const { natural, rgba } = await sheetPixels(url);
  const { owner, list: shapes } = blobsIn({ natural, rgba }, grid);
  const body = bodiesOf(shapes, grid);
  const rows = lanes(shapes, body, grid, cell => Math.floor(cell / grid), 'minY', 'maxY');
  const columns = lanes(shapes, body, grid, cell => cell % grid, 'minX', 'maxX');
  const frames = Array.from({ length: grid * grid }, (_, cell) => {
    const row = Math.floor(cell / grid), column = cell % grid;
    return {
      cell, row, column, natural, size: natural / grid,
      ...shoulders(natural, owner, body.get(cell), natural / grid, cellBox(row, column, natural, grid)),
      ...extent(shapes, rows, columns, row, column)
    };
  });
  return { natural, size: natural / grid, grid, frames };
}

// One uniform crop per sheet: the tallest and widest pose decide how much room
// is needed, the space between rows and columns decides how much is allowed.
function plan({ frames, size }) {
  const pad = Math.round(size * PAD);
  // Reserve the full decoration extent. Neighbouring rows must not shrink
  // another frame's crop: each frame gets its own source-space bounds below.
  const above = Math.max(...frames.map(f => f.floor - f.top)) + pad;
  const half = Math.max(...frames.map(f => Math.max(f.right - f.cx, f.cx - f.left))) + pad;
  return { pad, above, half };
}

// The box holding everything drawn for one pose, floating decorations included.
function extent(shapes, rows, columns, row, column) {
  const mine = shapes.filter((shape, i) => rows[i] === row && columns[i] === column);
  return {
    top: Math.min(...mine.map(s => s.minY)), bottom: Math.max(...mine.map(s => s.maxY)),
    left: Math.min(...mine.map(s => s.minX)), right: Math.max(...mine.map(s => s.maxX))
  };
}

async function sheetPixels(url) {
  const image = new Image();
  image.src = url;
  let timer;
  try {
    await Promise.race([
      image.decode ? image.decode() : new Promise((ok, fail) => {
        image.onload = ok;
        image.onerror = () => fail(new Error(`${url} 加载失败`));
      }),
      new Promise((_, fail) => { timer = setTimeout(() => fail(new Error(`${url} 加载超时`)), TIMEOUT); })
    ]);
  } finally {
    clearTimeout(timer);
  }
  const natural = image.naturalWidth;
  if (image.naturalHeight !== natural) throw new Error(`${url} 需要正方形的精灵图`);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = natural;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, natural, natural);
  return { natural, rgba: context.getImageData(0, 0, natural, natural).data };
}

// Flood fill the whole sheet so every outline keeps its own identity.
function blobsIn({ natural, rgba }, grid) {
  const size = natural / grid;
  const owner = new Uint32Array(natural * natural);
  const queue = new Int32Array(owner.length);
  const list = [];
  for (let start = 0; start < owner.length; start++) {
    if (owner[start] || rgba[start * 4 + 3] <= OPAQUE) continue;
    const id = list.length + 1;
    let read = 0, end = 1;
    queue[0] = start; owner[start] = id;
    const take = pos => {
      if (owner[pos] || rgba[pos * 4 + 3] <= OPAQUE) return;
      owner[pos] = id; queue[end++] = pos;
    };
    const hits = new Map();
    let minX = natural, maxX = 0, minY = natural, maxY = 0;
    while (read < end) {
      const pos = queue[read++];
      const x = pos % natural, y = (pos - x) / natural;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const cell = Math.min(grid - 1, Math.floor(y / size)) * grid + Math.min(grid - 1, Math.floor(x / size));
      hits.set(cell, (hits.get(cell) ?? 0) + 1);
      if (x > 0) take(pos - 1);
      if (x < natural - 1) take(pos + 1);
      if (y > 0) take(pos - natural);
      if (y < natural - 1) take(pos + natural);
    }
    list.push({ id, count: end, minX, maxX, minY, maxY, hits });
  }
  return { owner, list };
}

// Bodies tower over their floating decorations, so the cell holding most of a
// shape still names the pose.
function bodiesOf(shapes, grid) {
  const found = new Map();
  for (const shape of shapes) {
    for (const [cell, hits] of shape.hits) {
      const best = found.get(cell);
      if (hits >= shape.count / 2 && (!best || hits > best.hits)) found.set(cell, { shape, hits });
    }
  }
  if (found.size !== grid * grid) throw new Error(`只找到 ${found.size}/${grid * grid} 个角色，素材无法对齐`);
  return new Map(Array.from(found, ([cell, { shape }]) => [cell, shape]));
}

// Sort every shape into a row / column, so a heart floating above the head still
// counts as part of the pose it was drawn for.
function lanes(shapes, body, grid, indexOf, low, high) {
  const anchors = Array.from({ length: grid }, (_, lane) => {
    const group = Array.from(body).filter(([cell]) => indexOf(cell) === lane).map(([, shape]) => shape);
    return [Math.min(...group.map(s => s[low])), Math.max(...group.map(s => s[high]))];
  });
  return shapes.map(shape => {
    const centre = (shape[low] + shape[high]) / 2;
    let best = 0, gap = Infinity;
    anchors.forEach(([lo, hi], lane) => {
      const away = centre < lo ? lo - centre : centre > hi ? centre - hi : 0;
      if (away < gap) { gap = away; best = lane; }
    });
    return best;
  });
}

function cellBox(row, column, natural, grid) {
  const size = natural / grid;
  return {
    x0: Math.floor(column * size), x1: Math.min(natural, Math.ceil((column + 1) * size)),
    y0: Math.floor(row * size), y1: Math.min(natural, Math.ceil((row + 1) * size))
  };
}

// Shoulders, never the moving head: a short strip taken over the feet.
function shoulders(natural, owner, shape, size, { x0, x1, y0, y1 }) {
  const floor = shape.maxY;
  const band = Math.min(y1 - 1, Math.max(y0, floor - Math.floor(size * .05)));
  let left = natural, right = 0;
  for (let y = band; y < y1; y++) {
    const base = y * natural;
    for (let x = x0; x < x1; x++) {
      if (owner[base + x] !== shape.id) continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  return { cx: (left + right) / 2, floor, shoulderWidth: right - left };
}

// Draw one frame: one zoom for the sheet, one crop for the sheet, and the pose
// anchored on its own shoulders and feet.
// Layout width, never the rendered one: the click squash animates a parent
// transform, and a rect measured mid-animation is scaled, which used to make
// every frame applied during a reaction jump in size and position.
export function applyFrame(layer, frame, viewport = layer.offsetWidth || layer.getBoundingClientRect().width) {
  // Nothing sensible can be drawn from a zero-sized box, and a frame sized from
  // one used to blank the layer out completely.
  if (!(viewport > 0)) return false;
  const floorLine = frame.floorLine ?? FLOOR;
  const zoom = viewport * frame.zoom;
  layer.style.backgroundSize = `${frame.natural * zoom}px ${frame.natural * zoom}px`;
  layer.style.backgroundPosition = `${viewport / 2 - frame.cx * zoom}px ${viewport * floorLine - frame.floor * zoom}px`;
  // Crop this pose's full content, including floating hearts/stars. Use a
  // small sampling margin; a shared crop was cutting the tallest expressions.
  const margin = 2;
  const top = viewport * floorLine + (frame.top - margin - frame.floor) * zoom;
  const left = viewport / 2 + (frame.left - margin - frame.cx) * zoom;
  const right = viewport / 2 + (frame.right + margin - frame.cx) * zoom;
  const bottom = viewport * floorLine + (frame.bottom + margin - frame.floor) * zoom;
  layer.style.clipPath = `inset(${Math.max(0, top)}px ${Math.max(0, viewport - right)}px ${Math.max(0, viewport - bottom)}px ${Math.max(0, left)}px)`;
  layer.style.transform = 'none';
  return true;
}
