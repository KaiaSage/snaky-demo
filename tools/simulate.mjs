// Plays many games against the policy: random, greedy-blocking and "optimal" Breakers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
vm.runInThisContext(readFileSync(here('../js/certificate.js'), 'utf8'));
vm.runInThisContext(readFileSync(here('../js/engine.js'), 'utf8'));
const S = globalThis.Snaky;
const cert = S.load(globalThis.SNAKY_CERTIFICATE);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
function freeCells(g) { const a = []; for (let x = 0; x < 19; x++) for (let y = 0; y < 19; y++) { const k = S.key(x, y); if (g.isFree(k)) a.push(k); } return a; }
function play(policy, breaker) {
  const g = new S.Game(cert, { policy });
  let free = 0;
  while (true) {
    const m = g.makerMove();
    free += m.descents.length;
    if (g.won) return { moves: g.won.moves, free };
    if (g.makerMoves > 21) throw new Error('exceeded 21');
    g.breakerMove(breaker(g));
  }
}
const rand = (g) => { const f = freeCells(g); return f[Math.floor(rnd() * f.length)]; };
const inEnv = (g) => { const { map } = g.replyMap(); const ks = [...map.keys()]; return ks.length ? ks[Math.floor(rnd() * ks.length)] : rand(g); };
const optimal = (g) => { const { map, base } = g.replyMap(); let best = null, bv = base.value; for (const [k, v] of map) if (v.value > bv || (v.value === bv && best === null && v.value > base.value)) { bv = v.value; best = k; } if (best === null) { const ks=[...map.keys()].filter(k=>map.get(k).value===bv); best = ks.length? ks[Math.floor(rnd()*ks.length)] : rand(g);} else { const ks=[...map.keys()].filter(k=>map.get(k).value===bv); best = ks[Math.floor(rnd()*ks.length)]; } return best; };
for (const policy of ['smart', 'paper']) {
  for (const [name, br, n] of [['random', rand, 300], ['in-envelope', inEnv, 300], ['optimal', optimal, 300]]) {
    const hist = {}; let frees = 0;
    for (let i = 0; i < n; i++) { const r = play(policy, br); hist[r.moves] = (hist[r.moves] || 0) + 1; frees += r.free; }
    console.log(policy.padEnd(6), name.padEnd(12), JSON.stringify(hist), 'free descents:', frees);
  }
}
