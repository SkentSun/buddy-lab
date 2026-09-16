// Record a 9:16 demo clip of buddy lab for social sharing.
//
// No screen recorder and no npm deps: Chrome's own CDP screencast hands over
// one frame per compositor tick, a requestAnimationFrame "ticker" keeps those
// ticks coming while the page is otherwise still, and ffmpeg stitches the
// frames - with their real timestamps - into an h264 mp4.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

// Captured smaller, published bigger: software GL in headless renders a full
// 1080x1920 frame at about ten a second, which panning shows up as a stutter.
const W = 540, H = 960;   // capture
const OW = 1080, OH = 1920;   // output
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8793/index.html';
const OUT = process.argv[2] ?? '/Users/sunjian/Documents/POC/mascot-lab/demo-9x16.mp4';
const WORK = '/tmp/buddy-demo';
const PORT = 9333;

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--force-color-profile=srgb',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/buddy-demo-profile', 'about:blank'
], { stdio: 'ignore' });
process.on('exit', () => chrome.kill());

const target = await (async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome 没起来');
})();

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(done => socket.addEventListener('open', done, { once: true }));
let id = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message.result); pending.delete(message.id); }
});
const send = (method, params = {}) => new Promise(done => {
  const key = ++id;
  pending.set(key, done);
  socket.send(JSON.stringify({ id: key, method, params }));
});

// Frames arrive whenever the compositor draws; each one carries its own time,
// so the final timeline keeps the real rhythm instead of a guessed fps.
const frames = [];
const start = Date.now();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method !== 'Page.screencastFrame') return;
  const frame = message.params;
  send('Page.screencastFrameAck', { sessionId: frame.sessionId });
  // Arrival time comes in bursts; the frame's own render timestamp is the real
  // clock. Navigations restart that clock, so keep the line monotonic.
  const last = frames.at(-1);
  const raw = (frame.metadata?.timestamp ?? 0) * 1000;
  const at = last ? Math.max(raw, last.at + 33) : raw;
  const name = `${WORK}/frame-${String(frames.length).padStart(5, '0')}.jpg`;
  frames.push({ name, at });
  writeFileSync(name, Buffer.from(frame.data, 'base64'));
});
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

// Recording-only dressing: the page keeps its own layout, it just gets framed
// for a vertical clip - content centred, the long read hidden, one caption.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = \`
    html,body{background:#f7f6f2}
    main{max-width:1080px;margin:auto;padding:48px 40px;min-height:100vh;
         display:flex;flex-direction:column;justify-content:center;gap:0}
    .cards,.footer{display:none}
    .intro{margin-top:0}
    #demo-caption{position:fixed;left:0;right:0;bottom:96px;text-align:center;
      font:500 34px/1.4 Arial,"PingFang SC",sans-serif;letter-spacing:-1px;
      color:#6b7064;opacity:0;transition:opacity .45s ease;pointer-events:none}
    #demo-caption[data-on]{opacity:1}
    #demo-brand{position:fixed;left:0;right:0;bottom:48px;text-align:center;
      font:500 19px/1 Arial,"PingFang SC",sans-serif;letter-spacing:4px;
      color:#a1a797;opacity:0;transition:opacity .45s ease;pointer-events:none}
    #demo-brand[data-on]{opacity:1}
  \`;
  document.head.appendChild(style);
  const caption = document.createElement('div');
  caption.id = 'demo-caption';
  document.body.appendChild(caption);
  const brand = document.createElement('div');
  brand.id = 'demo-brand';
  brand.textContent = '小伴 / buddy lab';
  brand.setAttribute('data-on', '');
  document.body.appendChild(brand);
  window.__demo = { show: text => { if (text) caption.textContent = text; caption.toggleAttribute('data-on', Boolean(text)); } };
  // A still page gets no compositor frames at all, which would leave the clip
  // frozen: this one pixel keeps asking for them.
  const tick = document.createElement('div');
  tick.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;will-change:transform';
  document.body.appendChild(tick);
  let flip = 0;
  (function spin() { tick.style.transform = 'translateX(' + (flip ^= 1) + 'px)'; requestAnimationFrame(spin); })();
});`
});

const evaluate = async expression => {
  const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result?.value;
};
const caption = text => evaluate(`window.__demo ? (window.__demo.show(${JSON.stringify(text)}), 'ok') : 'no'`);
const ready = async () => {
  for (let i = 0; i < 60; i++) {
    if (await evaluate(`document.querySelector('.mascot')?.dataset.ready === 'true'`)) return true;
    await sleep(200);
  }
  return false;
};
// Swapping characters no longer reloads the page, so the ready flag never goes
// away: wait for the new art to actually be on the stage instead. A swap has no
// navigation to repaint the page, and headless Chrome only pushes screencast
// frames when something actually changes - so nudge the cursor (a pixel, well
// below the pose threshold) to keep the frame stream alive.
const staged = async id => {
  for (let i = 0; i < 80; i++) {
    if (await evaluate(`(document.querySelector('.direction-sheet').style.backgroundImage || '').includes(${JSON.stringify(id + '-directions')})`)) return true;
    await move(360 + (i % 3), 620);
    await sleep(150);
  }
  return false;
};
let cursor = [360, 620];
const move = async (x, y) => { cursor = [x, y]; return send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); };
// Headless Chrome only pushes screencast frames when something changes, so a
// still page simply stops producing them. Waiting keeps a sub-pixel cursor
// alive - below the pose threshold, so nothing visibly moves - and the frame
// stream keeps flowing.
const hold = async ms => {
  const end = Date.now() + ms;
  for (let i = 0; Date.now() < end; i++) {
    await move(cursor[0] + (i % 3) - 1, cursor[1] + (i % 2));
    await sleep(40);
  }
};
const glide = async (from, to, ms, steps = 24) => {
  for (let s = 1; s <= steps; s++) {
    await move(from[0] + (to[0] - from[0]) * s / steps, from[1] + (to[1] - from[1]) * s / steps);
    await sleep(ms / steps);
  }
};
const click = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
};
const centreOf = async selector => JSON.parse(await evaluate(
  `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();`
  + ` return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]); })()`));

const avatarsUp = async () => {
  for (let i = 0; i < 80; i++) {
    if (await evaluate(`document.querySelectorAll('.avatar-tile').length && [...document.querySelectorAll('.avatar-tile')].every(t => t.style.opacity === '1')`)) return true;
    await sleep(200);
  }
  return false;
};

await send('Page.navigate', { url: `${BASE}?mascot=cat` });
await sleep(2500);
await ready();
await avatarsUp();       // every avatar measured before the camera rolls
await send('Page.startScreencast', { format: 'jpeg', quality: 78, everyNthFrame: 1 });
await hold(400);

const mark = label => console.log(String(label).padEnd(10), 'frames=' + String(frames.length).padStart(4), 't=' + ((frames.at(-1)?.at ?? 0) / 1000).toFixed(1) + 's');

// --- 1. it watches the cursor -------------------------------------------------
const stage = await centreOf('.mascot');
await caption('移动鼠标，它一直看着你');
await move(120, 300);
await hold(500);
await glide([120, stage[1] - 260], [960, stage[1] - 260], 900);   // sweep above
await glide([960, stage[1] - 260], [960, stage[1] + 300], 800);   // down the right
await glide([960, stage[1] + 300], [120, stage[1] + 300], 900);   // along the bottom
await glide([120, stage[1] + 300], [540, stage[1] - 40], 700);    // back to the face
await hold(400);

mark('<<');
mark('<<');
// --- 2. poke it ---------------------------------------------------------------
await caption('戳一下，看它的反应');
await hold(450);
await click(stage[0], stage[1]);
await hold(1400);
await click(stage[0], stage[1]);
await hold(1500);

// --- 3. swap characters -------------------------------------------------------
await caption('12 个角色，点一下就换');
await hold(600);
// Click by id, never by position: the grid reorders with every switch.
const tile = async id => centreOf(`.avatar-grid a[href$="mascot=${id}"]`);
let last = [540, stage[1] - 40];
for (const id of ['kirby', 'paimon']) {
  const spot = await tile(id);
  await glide(last, spot, 700, 14);
  await hold(350);
  await click(spot[0], spot[1]);
  await hold(350);
  await staged(id);
  mark('swapped:' + id);
  // Drift back to the stage: the new character turns to watch the cursor go,
  // and that movement is also what keeps the frames coming.
  await glide(spot, [stage[0] + 70, stage[1] - 90], 900, 16);
  await hold(800);
  last = [stage[0] + 70, stage[1] - 90];
}

// --- 4. end card --------------------------------------------------------------
await caption('让你的页面住进一个小伙伴');
await glide(last, [stage[0], stage[1] - 30], 800, 14);
await hold(1300);
await send('Page.stopScreencast');
await sleep(300);

const list = frames.map((frame, i) => {
  const next = frames[i + 1];
  const span = Math.min(420, Math.max(8, (next ? next.at : frame.at + 33) - frame.at));
  return `file '${frame.name}'\nduration ${(span / 1000).toFixed(3)}`;
});
writeFileSync(`${WORK}/frames.txt`, `ffconcat version 1.0\n${list.join('\n')}\nfile '${frames.at(-1).name}'\nduration 0.033\n`);
console.log(`抓到 ${frames.length} 帧，约 ${(((frames.at(-1)?.at ?? 0) - (frames[0]?.at ?? 0)) / 1000).toFixed(1)}s`);
socket.close();
chrome.kill();

const ffmpeg = spawn('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', `${WORK}/frames.txt`,
  '-vf', `fps=30,scale=${OW}:${OH}:flags=lanczos,format=yuv420p,fade=t=in:st=0:d=0.35`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-movflags', '+faststart', OUT
], { stdio: 'inherit' });
await new Promise(done => ffmpeg.on('exit', done));
console.log('输出 -> ' + OUT);
