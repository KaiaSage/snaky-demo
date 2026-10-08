// Independent check of certificate20.txt with the repo's JavaScript engine (a separate parser and
// combination-rule implementation from the Python verifier). Loads the new final card as Black's
// strategy and plays it: random, envelope-only and perfect White players, plus the exact depth a
// perfect White can force.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { SYMBOLS } from './symbols.mjs';
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
// Same engine, with only the coordinate alphabet widened to match the new certificate.
const engineSrc = readFileSync(here('../../js/engine.js'), 'utf8').replace("const SYM = '0123456789ABCDEFG';", 'const SYM = ' + JSON.stringify(SYMBOLS) + ';');
if (!engineSrc.includes(JSON.stringify(SYMBOLS))) throw new Error('could not widen the alphabet');
vm.runInThisContext(engineSrc);
const S = globalThis.Snaky;
const cert = S.load(readFileSync(here('./certificate20.txt'), 'utf8'));
const root = cert.cards[cert.cards.length - 1].root;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
ok(root.A.size === 0 && root.h === 20, `final card ${cert.cards.length - 1}: A empty, h = ${root.h}`);
ok(root.V === 20, `a perfect White forces exactly ${root.V} moves against it (computed over the whole tree)`);
const shifted = new Set([...cert.cards[727].root.T].map((k) => S.key(S.kx(k) + 24, S.ky(k) + 24)));
ok(root.T.size === shifted.size && [...root.T].every((k) => shifted.has(k)), `final envelope is exactly card 727's 251 cells (shifted by 24): ${root.T.size} cells`);
ok(cert.cards[727].root.h === 21 && cert.cards[727].root.T.size === 251, 'card 727 unchanged');

let seed = 1; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const play = (pick) => { const g = new S.Game(cert, { size: 64, offset: 0 }); g.makerMove();
  while (!g.won) { g.breakerMove(pick(g)); g.makerMove(); if (g.makerMoves > 20) return 99; } return g.won.moves; };
const free = (g) => { const a = []; for (let x = 16; x < 48; x++) for (let y = 16; y < 48; y++) { const k = S.key(x, y); if (g.isFree(k)) a.push(k); } return a; };
const random = (g) => { const f = free(g); return f[Math.floor(rnd() * f.length)]; };
const inEnv = (g) => { const ks = [...g.replyMap().map.keys()]; return ks.length ? ks[Math.floor(rnd() * ks.length)] : random(g); };
const perfect = (g) => { const { map, base } = g.replyMap(); let bv = base.value, c = []; for (const [k, v] of map) { if (v.value > bv) { bv = v.value; c = [k]; } else if (v.value === bv) c.push(k); } return c.length ? c[Math.floor(rnd() * c.length)] : random(g); };
for (const [name, f, n] of [['random', random, 300], ['envelope-only', inEnv, 300], ['perfect', perfect, 300]]) {
  const hist = {}; let worst = 0;
  for (let i = 0; i < n; i++) { const r = play(f); hist[r] = (hist[r] || 0) + 1; worst = Math.max(worst, r); }
  ok(worst <= 20, `${name} White, ${n} games: ${JSON.stringify(hist)}`);
}
