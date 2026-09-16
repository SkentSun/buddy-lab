// Whatever version stamp index.html used, fetch the alignment module with the
// same one: a cached copy of one file must never pair with a fresh copy of the
// other - that mismatch used to leave the mascot completely still.
const mascotId = new URLSearchParams(location.search).get('mascot') ?? 'cat';
let customArt = mascotId !== 'astronaut';
let directionUrl = 'assets/legacy/directions-25.webp';
let reactionUrl = 'assets/legacy/reactions.webp';
const stamp = new URL(import.meta.url).searchParams.get('v') ?? '';
const { registerSprites, avatarFrames, applyFrame } = await import(`./sprite-alignment.js?v=${stamp}`);
// Independent vanilla implementation using user-supplied 3 × 3 sprite sheets.
const button = document.querySelector('.mascot');
const squash = button.querySelector('.squash');
const directions = button.querySelector('.direction-sheet');
const reactions = button.querySelector('.reaction-sheet');
const status = document.querySelector('.status');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clockwiseCells = [5, 8, 7, 6, 3, 0, 1, 2];
const names = ['闭眼', '爱心', '闪光', '惊讶', '星星眼', '害羞', '困倦', '眩晕', '开心'];
let sector = -1, pointer = null, raf = 0, count = 0, lastClick = -Infinity;
let timers = [], animation = null, reaction = null;
let alignment, frames = null;
let grid = 5, column = 2, row = 2;

// The cast. Adding a character means adding a line here - drop its 5x5 sheet
// ({id}-directions-25.webp) and 3x3 reactions sheet ({id}-reactions.webp) next
// to the others, done. Nothing else needs touching. `directions: null` means
// the legacy astronaut sheets (kept as the fallback look).
const characters = [
  { id: 'cat', name: '小猫', directions: 'assets/characters/cat-directions-25.webp', reactions: 'assets/characters/cat-reactions.webp' },
  { id: 'shinchan', name: '小新', directions: 'assets/characters/shinchan-directions-25.webp', reactions: 'assets/characters/shinchan-reactions.webp' },
  { id: 'hamster', name: '仓鼠', directions: 'assets/characters/hamster-directions-25.webp', reactions: 'assets/characters/hamster-reactions.webp' },
  { id: 'cheerleader', name: '啦啦队女孩', directions: 'assets/characters/cheerleader-directions-25.webp', reactions: 'assets/characters/cheerleader-reactions.webp' },
  { id: 'hanfu', name: '汉服小女孩', directions: 'assets/characters/hanfu-directions-25.webp', reactions: 'assets/characters/hanfu-reactions.webp' },
  { id: 'ragdoll', name: '布偶猫', directions: 'assets/characters/ragdoll-directions-25.webp', reactions: 'assets/characters/ragdoll-reactions.webp' },
  { id: 'kirby', name: '卡比', directions: 'assets/characters/kirby-directions-25.webp', reactions: 'assets/characters/kirby-reactions.webp' },
  { id: 'shiba', name: '柴犬', directions: 'assets/characters/shiba-directions-25.webp', reactions: 'assets/characters/shiba-reactions.webp' },
  { id: 'capybara', name: '水豚', directions: 'assets/characters/capybara-directions-25.webp', reactions: 'assets/characters/capybara-reactions.webp' },
  { id: 'paimon', name: '派蒙', directions: 'assets/characters/paimon-directions-25.webp', reactions: 'assets/characters/paimon-reactions.webp' },
  { id: 'coder', name: '社恐程序员', directions: 'assets/characters/coder-directions-25.webp', reactions: 'assets/characters/coder-reactions.webp' },
  { id: 'magicalgirl', name: '魔法少女', directions: 'assets/characters/magicalgirl-directions-25.webp', reactions: 'assets/characters/magicalgirl-reactions.webp' }
];
{
  const character = characters.find(c => c.id === mascotId) ?? characters[0];
  customArt = Boolean(character.directions);
  if (character.directions) {
    directionUrl = character.directions;
    reactionUrl = character.reactions;
  } else {
    reactionUrl = character.reactions;
  }
}
// Set the layers only after the cast lookup above: this used to run first and
// left the reaction sheet pointing at the legacy art no matter who was on stage.
if (customArt) directions.style.backgroundImage = `url(${directionUrl})`;
reactions.style.backgroundImage = `url(${reactionUrl})`;

// Every avatar is a real tile of that character's own sheet, so it turns to
// look at the cursor like the big one does.
const avatars = characters.map(character => {
  const link = document.createElement('a');
  link.className = 'avatar-link';
  link.href = `?mascot=${character.id}`;
  link.title = character.name;
  link.setAttribute('aria-label', character.name);
  const tile = document.createElement('span');
  tile.className = 'avatar-tile';
  // Hidden until its own registration lands: the raw 500% grid slice shows
  // neighbours' edges, which flashed across every character switch.
  tile.style.opacity = '0';
  tile.style.transition = 'opacity .25s ease';
  tile.style.backgroundImage = `url(${character.directions ?? 'assets/legacy/directions-25.webp'})`;
  link.appendChild(tile);
  // Staying on the page: a real navigation reloaded everything and put every
  // avatar back through its unregistered slice. Modifier clicks still open a
  // fresh tab, the way a link should.
  link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!button.disabled) switchTo(character);
  });
  document.querySelector('#switcher').appendChild(link);
  if (character.id === mascotId) link.setAttribute('aria-current', 'true');
  return { character, link, tile, frames: null, column: 2, row: 2, cell: -1 };
});
avatars.forEach(faceFront);   // centre pose before anyone moves a muscle

function paintAvatars() {
  if (!pointer || !finePointer.matches) return;
  for (const avatar of avatars) {
    const box = avatar.tile.getBoundingClientRect();
    const dx = pointer.x - box.left - box.width / 2;
    const dy = pointer.y - box.top - box.height / 2;
    const step = (distance, previous) => {
      const value = Math.max(0, Math.min(4, distance / 90 + 2));
      return Math.abs(value - previous) < .6 ? previous : Math.round(value);
    };
    avatar.column = step(dx, avatar.column);
    avatar.row = step(dy, avatar.row);
    const cell = avatar.row * 5 + avatar.column;
    if (cell === avatar.cell) continue;
    avatar.cell = cell;
    avatar.tile.dataset.cell = String(cell);
    const frame = avatar.frames?.[cell];
    if (frame && applyFrame(avatar.tile, frame) !== false) continue;
    // No registration yet: plain grid maths keeps them looking around anyway.
    avatar.tile.style.backgroundSize = '500% 500%';
    avatar.tile.style.backgroundPosition = `${cell % 5 * 25}% ${Math.floor(cell / 5) * 25}%`;
  }
}

// Measured after the stage is up: the stage is what people wait for.
// Small pool, not Promise.all: every measurement holds a full decoded sheet,
// and twelve of those at once spikes memory hard.
const idle = window.requestIdleCallback ?? (task => setTimeout(task, 200));
function loadAvatars() { idle(async () => {
  const queue = [...avatars];
  const worker = async () => {
    while (queue.length) {
      const avatar = queue.shift();
      try {
        avatar.frames = await avatarFrames(avatar.character.directions ?? 'assets/legacy/directions-25.webp', 5);
        faceFront(avatar);
        avatar.tile.style.opacity = '1';
      } catch (error) {
        console.warn(`[avatar] ${avatar.character.id} 未成功对齐，用简单切格：${error.message}`);
        avatar.tile.style.opacity = '1';
      }
    }
  };
  await Promise.all([worker(), worker()]);
  pointer ? paintAvatars() : avatars.forEach(faceFront);
}); }

const sheetKey = layer => layer === directions ? (grid === 5 ? 'directions25' : 'directions') : 'reactions';

// Until the first measured frame lands, the layer would paint the raw sheet
// through its default 300% background - that is a slice of the grid with its
// neighbours in it, exactly the flicker seen while switching characters.
// Stay invisible, then fade in once there is something correct to look at.
function reveal() { button.dataset.ready = 'true'; }

// Measured frames are nicer, but the show must go on without them: while the
// registration is still running - or if a sheet never loads at all - fall back
// to plain grid maths so the mascot keeps following the pointer.
// Returns whether the frame is actually on screen, so callers can tell a drawn
// pose from an empty layer.
function setCell(layer, index) {
  layer.dataset.cell = String(index);
  const frame = frames?.[sheetKey(layer)]?.[index];
  if (frame && applyFrame(layer, frame) !== false) return true;
  if (layer === reactions) return false;
  const n = layer === directions ? (customArt ? 5 : grid) : 3;
  if (customArt && layer === directions && grid === 3) index = [0,2,4,10,12,14,20,22,24][index];
  layer.style.backgroundSize = `${n * 100}% ${n * 100}%`;
  layer.style.backgroundPosition = `${index % n * 100 / (n - 1)}% ${Math.floor(index / n) * 100 / (n - 1)}%`;
  layer.style.clipPath = 'none';
  layer.style.transform = 'none';
  return n > 0;
}

function showReaction(index) {
  reaction = index;
  button.dataset.reaction = index === null ? 'none' : names[index];
  // The stage must never go blank: if the reaction cannot be drawn, keep the
  // ordinary face rather than hiding it behind an empty layer.
  const shown = index !== null && setCell(reactions, index);
  reactions.style.opacity = shown ? '1' : '0';
  directions.style.opacity = shown ? '0' : '1';
  status.textContent = index === null
    ? (frames ? '· 鼠标跟随中 ·' : '· 鼠标跟随中 · 素材未对齐，暂用简单切格')
    : `· ${names[index]} ·`;
}

function aim() {
  raf = 0;
  if (!pointer || !finePointer.matches) return;
  const box = button.getBoundingClientRect();
  const dx = pointer.x - box.left - box.width / 2;
  const dy = pointer.y - box.top - box.height / 2;
  paintAvatars();
  if (grid === 5) {
    // Two independent axes supply all 25 poses; use hysteresis at each boundary.
    const quantize = (distance, previous) => {
      const value = Math.max(0, Math.min(4, distance / 120 + 2));
      return Math.abs(value - previous) < .62 ? previous : Math.round(value);
    };
    column = quantize(dx, column); row = quantize(dy, row);
    setCell(directions, row * 5 + column);
    document.querySelector('#frame-info').textContent = `25 格 · 第 ${row + 1} 行 / 第 ${column + 1} 列`;
    return;
  }
  const label = ['右', '右下', '下', '左下', '左', '左上', '上', '右上'];
  if (Math.hypot(dx, dy) < 70) {
    sector = -1;
    setCell(directions, 4);
    document.querySelector('#frame-info').textContent = '9 格 · 正面';
    return;
  }
  const angle = Math.atan2(dy, dx), step = Math.PI / 4;
  const delta = angle - sector * step;
  // Small angular margin prevents flicker at the edge of two sectors.
  if (sector >= 0 && Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) < step / 2 + .12) return;
  sector = (Math.round(angle / step) + 8) % 8;
  setCell(directions, clockwiseCells[sector]);
  document.querySelector('#frame-info').textContent = `9 格 · ${label[sector]}`;
}

function queueAim() { if (!raf) raf = requestAnimationFrame(aim); }
window.addEventListener('pointermove', event => {
  pointer = { x: event.clientX, y: event.clientY };
  queueAim();
}, { passive: true });
window.addEventListener('scroll', queueAim, { passive: true });
window.addEventListener('resize', queueAim);
// No cursor to look at: everybody faces the front again.
function faceFront(avatar) {
  avatar.column = avatar.row = 2;
  avatar.cell = 12;
  avatar.tile.dataset.cell = '12';
  const frame = avatar.frames?.[12];
  if (frame && applyFrame(avatar.tile, frame) !== false) return;
  avatar.tile.style.backgroundSize = '500% 500%';
  avatar.tile.style.backgroundPosition = '50% 50%';
}
function resetDirection() {
  pointer = null; sector = -1; column = row = grid === 5 ? 2 : 1;
  avatars.forEach(faceFront);
  setCell(directions, grid === 5 ? 12 : 4);
}
document.documentElement.addEventListener('pointerleave', resetDirection);
window.addEventListener('blur', resetDirection);

function boop() {
  timers.forEach(clearTimeout);
  timers = [];
  const now = performance.now();
  // Like the reference, each successive click must be within 1600 ms.
  count = now - lastClick < 1600 ? count + 1 : 1;
  lastClick = now;
  if (count >= 4) {
    count = 0;
    showReaction(7);
    timers.push(setTimeout(() => showReaction(null), 1100));
  } else {
    const payoff = [1, 2, 8][count - 1];
    showReaction(0);
    timers.push(setTimeout(() => showReaction(payoff), 120));
    timers.push(setTimeout(() => showReaction(null), 560));
  }
  animation?.cancel();
  if (!reducedMotion.matches) {
    animation = squash.animate([
      { transform: 'scale(1, 1)', easing: 'ease-in' },
      { transform: 'scale(1.10, .86)', offset: .18, easing: 'ease-out' },
      { transform: 'scale(.95, 1.08)', offset: .45, easing: 'ease-in-out' },
      { transform: 'scale(1.03, .97)', offset: .72, easing: 'ease-in-out' },
      { transform: 'scale(1, 1)' }
    ], { duration: 420, easing: 'linear' });
  }
}
button.addEventListener('click', boop);
document.querySelector('#test-boop').addEventListener('click', boop);
reducedMotion.addEventListener('change', () => animation?.cancel());
function selectGrid(next) {
  // No registration for the 25-cell art means no way to show it correctly.
  if (next === 5 && !frames?.directions25) return;
  grid = next;
  column = row = grid === 5 ? 2 : 1;
  sector = -1;
  directions.style.backgroundImage = `url(${customArt || grid === 5 ? directionUrl : 'assets/legacy/directions.webp'})`;
  setCell(directions, grid === 5 ? 12 : 4);
  document.querySelectorAll('[data-grid]').forEach(toggle => {
    const on = Number(toggle.dataset.grid) === grid;
    toggle.setAttribute('aria-pressed', String(on));
    toggle.disabled = !on && Number(toggle.dataset.grid) === 5 && !frames?.directions25;
  });
  document.querySelector('#frame-info').textContent = `${grid * grid} 格 · 正面`;
}
document.querySelectorAll('[data-grid]').forEach(toggle =>
  toggle.addEventListener('click', () => selectGrid(Number(toggle.dataset.grid))));

showReaction(null);
button.disabled = true;
document.querySelector('#test-boop').disabled = true;
status.textContent = '· 正在对齐角色素材 ·';
try {
  alignment = await registerSprites(true, customArt ? { directions: directionUrl, reactions: reactionUrl } : null);
  // Tolerate either return shape: a browser holding a cached copy of one file
  // and a fresh copy of the other used to leave the mascot frozen.
  frames = alignment?.frames ?? alignment;
  for (const name of alignment.missing) console.warn(`[sprite] ${name} 没有对齐数据，回退到简单切格`);
  // Expose the measured registration for review; no generated image files.
  button.dataset.aligned = 'true';
  selectGrid(frames.directions25 ? 5 : 3);
  setCell(reactions, 0);
} catch (error) {
  console.error(error);
  selectGrid(3);
} finally {
  reveal();
  button.disabled = false;
  document.querySelector('#test-boop').disabled = false;
  showReaction(null);
}

// Swapping the cast without a reload: the stage keeps showing the character it
// already has - at its measured size, still following the cursor - until the
// new sheets are measured, then both layers change in one go. Nothing is ever
// painted at the raw 300%/500% grid size, which is what used to flash.
const stageCache = new Map();
let switchToken = 0;
// Registration already decodes both sheets; no second network preload needed.
if (alignment && !alignment.missing.length) {
  stageCache.set(`${directionUrl}|${reactionUrl}`, alignment);
}
loadAvatars();

function clearInteraction() {
  timers.forEach(clearTimeout);
  timers = []; animation?.cancel(); animation = null;
  count = 0; lastClick = -Infinity;
}

async function switchTo(character, push = true) {
  const token = ++switchToken;
  const nextDirections = character.directions ?? 'assets/legacy/directions-25.webp';
  const nextReactions = character.reactions;
  const key = `${nextDirections}|${nextReactions}`;
  status.textContent = '· 正在切换角色 ·';
  let next = stageCache.get(key);
  if (!next) {
    try {
      next = await registerSprites(true, { directions: nextDirections, reactions: nextReactions });
      if (next.missing.length) throw new Error(`素材不完整：${next.missing.join("、")}`);
    } catch (error) {
      console.warn(`[switch] ${character.id} 素材没加载出来：${error.message}`);
      if (token === switchToken) status.textContent = '· 这个角色暂时换不过来 ·';
      return;
    }
    stageCache.set(key, next);
  }
  if (token !== switchToken) return;   // a later click already owns the stage
  clearInteraction();
  customArt = Boolean(character.directions);
  directionUrl = nextDirections;
  reactionUrl = nextReactions;
  frames = next.frames ?? next;
  directions.style.backgroundImage = `url(${directionUrl})`;
  reactions.style.backgroundImage = `url(${reactionUrl})`;
  grid = frames.directions25 ? 5 : 3;
  column = row = 2; sector = -1;
  for (const avatar of avatars) {
    if (avatar.character === character) avatar.link.setAttribute('aria-current', 'true');
    else avatar.link.removeAttribute('aria-current');
  }
  if (push) history.pushState({ mascot: character.id }, '', `?mascot=${character.id}`);
  document.querySelector('#frame-info').textContent = `${grid * grid} 格 · 正面`;
  selectGrid(grid);
  setCell(reactions, 0);
  showReaction(null);
  queueAim();
}

addEventListener('popstate', () => {
  const id = new URLSearchParams(location.search).get('mascot') ?? 'cat';
  switchTo(characters.find(c => c.id === id) ?? characters[0], false);
});

// Commit uploaded sheets only after both have passed registration.
export async function useUploadedSprites(nextDirections, nextReactions) {
  const next = await registerSprites(true, { directions: nextDirections, reactions: nextReactions });
  if (next.missing.length) throw new Error('两张素材都需要完整、可识别的网格');
  timers.forEach(clearTimeout); timers = []; animation?.cancel(); count = 0;
  customArt = true; directionUrl = nextDirections; reactionUrl = nextReactions;
  alignment = next; frames = next.frames;
  reactions.style.backgroundImage = `url(${reactionUrl})`;
  selectGrid(5); setCell(reactions, 0); showReaction(null);
}
