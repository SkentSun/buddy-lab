// Drive a real Chrome over CDP (no npm deps) and read the page after real time
// has passed - headless --virtual-time-budget races ahead of image decoding.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const url = process.argv[2] ?? 'http://127.0.0.1:8793/probe.html';
const waitMs = Number(process.argv[3] ?? 8000);

const chrome = spawn(CHROME, [
  `--headless=${process.env.HEADLESS ?? 'new'}`,
  '--no-sandbox', '--no-proxy-server', '--window-size=1280,900', '--force-device-scale-factor=1',
  '--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--disable-software-rasterizer=false',
  '--run-all-compositor-stages-before-draw', '--disable-features=PaintHolding',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/cdp-probe-profile', 'about:blank'
], { stdio: 'ignore' });

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
const logs = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.consoleAPICalled') logs.push(message.params.args.map(a => a.value ?? a.description).join(' '));
  if (message.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text));
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message.result); pending.delete(message.id); }
});
const send = (method, params = {}) => new Promise(done => {
  const key = ++id;
  pending.set(key, done);
  socket.send(JSON.stringify({ id: key, method, params }));
});
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
if (process.env.SAMPLE_LOAD) {
  // Installed before any page script runs: smoke tests that race the module's
  // own start-up measure nothing at all.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__load = [];
      (function tick() {
        const b = document.querySelector('.mascot');
        if (b) {
          const d = b.querySelector('.direction-sheet');
          window.__load.push([Math.round(performance.now()), b.dataset.ready ?? '-',
            Number(getComputedStyle(b).opacity).toFixed(2), getComputedStyle(d).backgroundSize]);
        } else {
          window.__load.push([Math.round(performance.now()), '-', '0', '']);
        }
        requestAnimationFrame(tick);
      })();`
  });
}
if (process.env.SHOW_RAW) {
  // Reproduce the pre-fix build, where the sheet was visible from the first
  // paint and defaulted to background-size:300%.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = '.mascot{opacity:1!important}';
      document.head.appendChild(s);
    });`
  });
}
await send('Page.navigate', { url });
await sleep(waitMs);
if (process.env.REAL_CLICK) {
  // A real trusted click: element.click() skips hit testing and can hide the
  // thing that actually swallows the pointer in a real browser.
  const box = await send('Runtime.evaluate', {
    expression: '(() => { const b = document.querySelector(".mascot").getBoundingClientRect();'
      + ' return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2, hit: (document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) || {}).className }); })()',
    returnByValue: true
  });
  const point = JSON.parse(box.result.value);
  console.log(`真实点击 @${Math.round(point.x)},${Math.round(point.y)} 命中元素 class=${point.hit}`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
  }
}
const expression = process.argv[4] ?? `(() => {
  const el = document.querySelector('#out');
  return el ? el.textContent : '(no #out)';
})()`;
const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
if (result.exceptionDetails) console.log('EXCEPTION ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text));
console.log(result.value);
if (process.argv[5]) {
  // fromSurface:false rasterises the renderer frame directly - with the surface
  // path headless Chrome kept handing back the very first paint, so every
  // screenshot looked identical no matter what the page was doing.
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
  writeFileSync(process.argv[5], Buffer.from(shot.data, 'base64'));
  console.log('screenshot -> ' + process.argv[5]);
}
if (logs.length) console.log('--- browser console ---\n' + logs.join('\n'));
socket.close();
chrome.kill();
