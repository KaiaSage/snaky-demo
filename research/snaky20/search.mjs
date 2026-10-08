// Command line for the claim-guided search (claimsearch.mjs).
// Usage: node search.mjs <t> [maxCandidates=8] [maxK=6] [out.txt]
import { writeFileSync } from 'node:fs';
import { S, OFF, extraLines } from './lib.mjs';
import { pool, RS, placedT, solve, makeCard, lines, stats, limits } from './claimsearch.mjs';

const T_GOAL = +(process.argv[2] || 20);
limits.MAX_CAND = +(process.argv[3] || 8);
limits.MAX_K = +(process.argv[4] || 6);
const OUT = process.argv[5] || '';

// ---------------------------------------------------------------- run
// By symmetry Black's first stone can go anywhere; use the paper's (8,8), i.e. board (16,16).
const first = S.key(8 + OFF, 8 + OFF);
const t0 = Date.now();
const M1 = new Set([first]);
// Root: claims needing only the first stone come from single-requirement cards placed on it.
function rootClaims(tNext) {
  const cs = [];
  for (const e of pool) {
    if (e.h > tNext || e.A.length !== 1) continue;
    for (const R of RS) {
      const [ax, ay] = S.apply(R, ...e.A[0]);
      const F = { a: R.a, b: R.b, c: R.c, d: R.d, tx: S.kx(first) - ax, ty: S.ky(first) - ay };
      cs.push({ node: e.node, F, h: e.h });
    }
  }
  return cs;
}
const cs = rootClaims(T_GOAL - 1);
let inter = null;
for (const c of cs) { const T = placedT(c); if (!inter) inter = new Set(T); else for (const k of inter) if (!T.has(k)) inter.delete(k); }
const K = [...inter].filter((k) => k !== first);
console.log(`goal ${T_GOAL}: ${pool.length} claims in the pool; ${cs.length} placed claims need only Black's first stone; ${K.length} White replies escape them all`);
const kids = [];
let ok = true;
for (const b of K) {
  const c = solve(M1, new Set([b]), T_GOAL - 1);
  console.log(`  reply (${S.kx(b) - OFF},${S.ky(b) - OFF}): ${c ? 'won within ' + c.h : 'NOT FOUND'}  [${stats.positions} positions, ${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  if (!c) { ok = false; break; }
  kids.push(c);
}
if (ok) {
  const root = makeCard(first, M1, new Set(K), cs, kids);
  console.log(`FOUND: final card ${root.node.newId}, height ${root.h}, ${lines.length} new cards, ${stats.positions} positions searched`);
  if (OUT) { writeFileSync(OUT, [globalThis.SNAKY_CERTIFICATE.trim(), ...extraLines, ...lines].join('\n') + '\n'); console.log('wrote ' + OUT); }
} else console.log(`no proof found with these limits (${stats.positions} positions)`);
