// Drives the bundled worker like an agent would: only ever fetching links it was given.
import worker from './dist/worker.js';
const ORIGIN = 'https://snaky.example';
const get = async (path) => { const r = await worker.fetch(new Request(ORIGIN + path)); return { status: r.status, text: await r.text() }; };
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const linkFor = (text, pt) => (new RegExp(`^${pt} (\\S+)$`, 'm').exec(text) || [])[1];

const home = await get('/');
ok(home.status === 200 && home.text.includes('/play?w=&links=0'), 'home page links to a new game');

// Replay the subagent's best blind game by following links only: Black should win on move 13.
let page = await get('/play?w=');
ok(page.text.includes('STATUS: Black has 1 stone. Last Black move: K10'), 'new game starts with Black at tengen');
for (const pt of ['L10', 'K12', 'J10', 'E10', 'F9', 'G9', 'J8', 'D8', 'J7', 'J9', 'G11', 'H11']) {
  const href = linkFor(page.text, pt);
  if (!href) { ok(false, `link for ${pt} present`); break; }
  page = await get(href.slice(ORIGIN.length));
}
ok(page.text.includes('SCORE: 13 of 21'), 'link-following replay of the blind game scores 13');
ok(page.text.includes('(;GM[1]') && page.text.includes(';W[kj]'), 'finished game prints SGF');
ok(!/^A1 /m.test(page.text), 'finished game lists no move links');

// Perfect defense using the glass view's own advice: should last all 21.
page = await get('/play?w=&glass=1&links=0');
let n = 0;
while (!page.text.includes('GAME OVER') && n++ < 30) {
  const m = /BEST REPLIES: ([A-T]\d+)/.exec(page.text) || /ALSO SLOW BLACK \(finish move\): ([A-T]\d+)/.exec(page.text);
  let pt = m && m[1];
  if (!pt) { // any reply is equally good: pick an empty point
    const free = [];
    for (const ln of page.text.split('\n').slice(4, 24)) { const mm = /^\s*(\d+) (.*) \d+$/.exec(ln); if (mm) [...mm[2].replace(/ /g, '')].forEach((c, i) => c === '.' && free.push('ABCDEFGHJKLMNOPQRST'[i] + mm[1])); }
    pt = free[0];
  }
  const r = await get(`/play?w=${page.w || ''}&glass=1&links=0&move=${pt}`);
  page = { ...r, w: (page.w || '') + toSgf(pt) };
}
function toSgf(pt) { const L = 'ABCDEFGHJKLMNOPQRST'; return String.fromCharCode(97 + L.indexOf(pt[0])) + String.fromCharCode(97 + 19 - +pt.slice(1)); }
ok(page.text.includes('SCORE: 21 of 21'), 'following the glass advice lasts all 21 moves');

const bad1 = await get('/play?w=jj');
ok(bad1.status === 400 && bad1.text.includes('already taken'), 'playing on an occupied point is a readable 400');
const bad2 = await get('/play?w=zz');
ok(bad2.status === 400, 'garbage w is a 400');
const bad3 = await get('/play?w=&move=I5');
ok(bad3.status === 400 && bad3.text.includes("Can't read"), 'unreadable move is a 400');
const nf = await get('/nope');
ok(nf.status === 404, 'unknown path is a 404');

// The page must give the canonical URL, with any &move folded into w.
const mv = await get('/play?w=&links=0&move=K11');
ok(mv.text.includes('POSITION URL:\nhttps://snaky.example/play?w=ji&links=0\n'), '&move page prints the canonical position URL');
const next = /For example:\n(\S+)$/m.exec(mv.text)[1];
const after = await get(next.slice(ORIGIN.length));
ok(after.status === 200 && /MOVES: B K10, W K11, B \w+, W /.test(after.text), 'the example URL plays a second move after K11');

const back = await get('/play?w=jiaa&links=0&move=K10');
ok(back.status === 400 && back.text.includes('BACK TO YOUR LAST POSITION:\nhttps://snaky.example/play?w=jiaa&links=0'), 'error page links back to the last valid position');
const back2 = await get('/play?w=jijizz');
ok(back2.text.includes('BACK TO YOUR LAST POSITION:\nhttps://snaky.example/play?w=ji\n'), 'error page backs up to the longest valid prefix');
const glass = await get('/play?w=&links=0&glass=1');
ok(/^SUMMARY: BEST .* \| FINISH move 21 \| LOST SO FAR 0$/m.test(glass.text), 'glass view has a one-line summary');
const long = [home, glass, mv].flatMap((r) => r.text.split('\n')).filter((l) => l.length > 110 && !/^https?:\/\//.test(l) && !l.startsWith('(;GM'));
ok(!long.length, 'no long non-URL lines' + (long.length ? ': ' + long[0] : ''));

const big = await get('/play?w=');
console.log(`page sizes: with links ${big.text.length} chars, without ${(await get('/play?w=&links=0')).text.length} chars`);
let t = performance.now(); for (let i = 0; i < 20; i++) await get('/play?w=kjjhijej&glass=1'); console.log(`avg request ${((performance.now() - t) / 20).toFixed(1)} ms (glass, 4 moves)`);
