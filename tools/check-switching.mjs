import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../mascot.js', import.meta.url), 'utf8');
const switching = source.slice(source.indexOf('async function switchTo('), source.indexOf("addEventListener('popstate'"));
const clearing = source.slice(source.indexOf('function clearInteraction()'), source.indexOf('async function switchTo('));
const calls = [], pending = new Map();
const context = vm.createContext({
  console: {warn(){}}, stageCache:new Map(), switchToken:0, status:{},
  registerSprites: (_flag, art) => new Promise(resolve => pending.set(art.directions, resolve)),
  timers:[10,20], clearTimeout:id=>calls.push(id), animation:{cancel:()=>calls.push('cancel')},
  count:3,lastClick:100, avatars:[], directions:{style:{}},reactions:{style:{}},
  document:{querySelector:()=>({})}, history:{pushState:()=>{}},
  selectGrid(){},setCell(){},showReaction(){},queueAim(){},
});
vm.runInContext(clearing + switching, context);
const character = id=>({id,directions:id,reactions:id+'-r'});
const good = {missing:[],frames:{directions25:[{}],reactions:[{}]}};
const first=context.switchTo(character('first'));
const second=context.switchTo(character('second'));
pending.get('second')(good); await second;
pending.get('first')(good); await first;
assert.equal(context.directionUrl,'second');
assert.deepEqual(calls,[10,20,'cancel']);
assert.equal(context.count,0); assert.equal(context.lastClick,-Infinity);
const failed=context.switchTo(character('broken'));
pending.get('broken')({missing:['reactions'],frames:{directions25:[{}]}}); await failed;
assert.equal(context.directionUrl,'second');
assert.equal(context.stageCache.has('broken|broken-r'),false);
const retry=context.switchTo(character('broken')); pending.get('broken')(good); await retry;
assert.equal(context.directionUrl,'broken');
const loads=[];
const pool=vm.createContext({window:{},setTimeout,avatars:Array.from({length:12},(_,i)=>({character:{id:i,directions:String(i)},tile:{style:{}}})),
 idle:async fn=>await fn(), avatarFrames:async url=>{loads.push(url);return []},faceFront(){},pointer:null,console,paintAvatars(){}});
let completion;
pool.idle=fn=>(completion=fn());
vm.runInContext(source.slice(source.indexOf('function loadAvatars()'),source.indexOf('const sheetKey')),pool);
pool.loadAvatars(); await completion;
assert.equal(loads.length,12); assert.equal(new Set(loads).size,12);
console.log('PASS: each avatar loads once; newest switch wins; old reaction resets; incomplete sheets retain current character and can retry');
