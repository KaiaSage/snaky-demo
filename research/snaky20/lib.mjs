// Shared setup for the Snaky-in-20 experiments: the repo's engine on a board big enough
// that its edge never matters, plus Snaky-placement helpers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
import { SYMBOLS } from './symbols.mjs';
vm.runInThisContext(readFileSync(here('../../js/certificate.js'), 'utf8'));
// The engine, with its coordinate alphabet widened so it can read extended certificates.
vm.runInThisContext(readFileSync(here('../../js/engine.js'), 'utf8').replace("const SYM = '0123456789ABCDEFG';", 'const SYM = ' + JSON.stringify(SYMBOLS) + ';'));
export const S = globalThis.Snaky;
// EXTRA_CARDS=file appends already-verified new cards (numbered from 728) to the claim pool.
export const extraLines = process.env.EXTRA_CARDS ? readFileSync(process.env.EXTRA_CARDS, 'utf8').trim().split('\n') : [];
export const cert = S.load(globalThis.SNAKY_CERTIFICATE.trim() + (extraLines.length ? '\n' + extraLines.join('\n') : ''));

// Board coordinates = certificate coordinates + OFF. The certificate's 17x17 box is [8,24]^2 and every
// Snaky with 4+ stones in it lies within 4 more, so nothing ever touches the edge of a 33x33 board.
export const SIZE = 33, OFF = 8;
export const PASS = S.key(700, 700); // one stand-in for every reply far from everything
export const newGame = () => { const g = new S.Game(cert, { size: SIZE, offset: OFF }); g.makerMove(); return g; };

const cache = new Map();
// All Snaky placements (as arrays of 6 cell keys) that contain cell k.
export function through(k) {
  let r = cache.get(k);
  if (r) return r;
  r = [];
  const x0 = S.kx(k), y0 = S.ky(k);
  for (const cells of S.ORIENTS) for (const [ax, ay] of cells) r.push(cells.map(([cx, cy]) => S.key(x0 - ax + cx, y0 - ay + cy)));
  cache.set(k, r);
  return r;
}

// A placement Black can complete with one stone right now: 5 Black stones, 1 empty, no White. Or null.
export function winNow(g) {
  for (const m of g.maker) for (const P of through(m)) {
    let b = 0, empty = null, ok = true;
    for (const c of P) { if (g.maker.has(c)) b++; else if (g.breaker.has(c)) { ok = false; break; } else empty = c; }
    if (ok && b === 5) return { P, cell: empty };
  }
  return null;
}

// Every point White might want to answer: the 17x17 box grown by 4 (see README for why that suffices).
export const REGION = [];
for (let x = OFF - 4; x <= OFF + 20; x++) for (let y = OFF - 4; y <= OFF + 20; y++) REGION.push(S.key(x, y));

// White's replies at a position (White to move), grouped soundly for target N:
//  - every empty point inside an envelope of a card in Black's current hand, individually;
//  - if Black's fastest card cannot finish by move N, also every empty point of REGION, plus PASS.
//  Otherwise all remaining replies leave Black on its fastest card, which finishes by move N.
export function replies(g, N) {
  const out = new Set();
  const { node, F } = g.cur;
  for (const kid of node.kids) for (const k of kid.T) { const a = S.applyKey(F, k); if (g.isFree(a)) out.add(a); }
  const expand = g.makerMoves + fastest(g) > N;
  if (expand) { for (const k of REGION) if (g.isFree(k)) out.add(k); out.add(PASS); }
  return { list: [...out], expand };
}
export const fastest = (g) => Math.min(...g.cur.node.kids.map((kid) => kid.node.V));
