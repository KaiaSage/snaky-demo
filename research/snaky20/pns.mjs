// Proof-number search over the claim-guided game tree (see claimsearch.mjs for the moves and leaves).
//
//   OR node  (Black to move, budget t): proven if a claim with h <= t applies, or if some move p is proven.
//   AND node (Black has played p):      proven if every escaping White reply in K leads to a proven OR node.
//
// Proof and disproof numbers pick the most promising node to expand next; solved positions are cached
// by their exact stones, so transpositions are solved once.
//
// Usage: node pns.mjs <goal> [maxExpansions=20000] [maxK=40] [out.txt] [dx,dy]
//   With dx,dy, proves only the position after Black (8,8) and White (8+dx, 8+dy), within goal-1 moves
//   (by symmetry one reply per type covers them all).
//   With pos:x,y;x,y|x,y;x,y|t instead, proves that Black (first list) to move against White (second list)
//   wins within t moves (certificate coordinates).
import { writeFileSync } from 'node:fs';
import { S, OFF, extraLines } from './lib.mjs';
import { pool, RS, claims, placedT, makeCard, lines } from './claimsearch.mjs';

const GOAL = +(process.argv[2] || 19);
const MAX_EXP = +(process.argv[3] || 20000);
const MAX_K = +(process.argv[4] || 40);
const OUT = process.argv[5] || '';
const POS = process.argv[6] && process.argv[6].startsWith('pos:') ? process.argv[6].slice(4).split('|') : null;
const ONLY = process.argv[6] && !POS ? process.argv[6].split(',').map(Number) : null;
const INF = 1e12;

const keyOf = (M, B, t) => [...M].sort((a, b) => a - b).join(',') + '|' + [...B].sort((a, b) => a - b).join(',') + '|' + t;
const solved = new Map(); // key -> { proven: bool, node }
let expansions = 0;

function orNode(M, B, t) {
  const key = keyOf(M, B, t);
  const n = { type: 'or', M, B, t, key, children: null, pn: 1, dn: 1, leaf: null };
  const s = solved.get(key);
  if (s) { n.pn = s.proven ? 0 : INF; n.dn = s.proven ? INF : 0; n.ref = s.node; }
  return n;
}

function expandOr(n) {
  expansions++;
  const { now, byP } = claims(n.M, n.B, n.t, n.t - 1);
  if (now) { n.leaf = now; n.pn = 0; n.dn = INF; solved.set(n.key, { proven: true, node: n }); return; }
  if (n.t <= 1) { n.pn = INF; n.dn = 0; solved.set(n.key, { proven: false, node: n }); return; }
  n.children = [];
  for (const [p, cs] of byP) {
    let inter = null;
    for (const c of cs) { const T = placedT(c); if (!inter) inter = new Set(T); else for (const k of inter) if (!T.has(k)) inter.delete(k); }
    const K = [...inter].filter((k) => k !== p && !n.M.has(k));
    if (K.length > MAX_K) continue;
    // Claims are not kept in the tree (memory); the proof's cards recompute them for the moves they use.
    n.children.push({ type: 'and', p, K, children: null, pn: K.length, dn: K.length ? 1 : INF }); // no escape: proved
  }
  if (!n.children.length) { n.pn = INF; n.dn = 0; solved.set(n.key, { proven: false, node: n }); }
  else update(n);
}

function expandAnd(a, parent) {
  const M2 = new Set(parent.M); M2.add(a.p);
  a.children = a.K.map((b) => { const B2 = new Set(parent.B); B2.add(b); return orNode(M2, B2, parent.t - 1); });
  update(a);
}

function update(n) {
  if (n.type === 'or') {
    if (n.leaf || !n.children) return; // leaf, unexpanded, or solved through the transposition table
    let pn = INF, dn = 0;
    for (const c of n.children) { pn = Math.min(pn, c.pn); dn = Math.min(INF, dn + c.dn); }
    n.pn = pn; n.dn = dn;
    if (pn === 0 || dn === 0) solved.set(n.key, { proven: pn === 0, node: n });
  } else {
    if (!n.children) { n.pn = n.K.length; n.dn = n.K.length ? 1 : INF; return; }
    let pn = 0, dn = INF;
    for (const c of n.children) { pn = Math.min(INF, pn + c.pn); dn = Math.min(dn, c.dn); }
    n.pn = pn; n.dn = dn;
  }
}

// One iteration: walk down to the most-proving node, expand it, update the path back up.
function iterate(root) {
  const path = [];
  let n = root, parent = null;
  for (;;) {
    path.push(n);
    if (n.type === 'or') {
      if (n.ref || n.pn === 0 || n.dn === 0) break; // solved via transposition table
      if (!n.children) { expandOr(n); break; }
      parent = n;
      n = n.children.reduce((a, b) => (b.pn < a.pn ? b : a));
    } else {
      if (!n.children) { expandAnd(n, parent); break; }
      n = n.children.reduce((a, b) => (b.dn < a.dn ? b : a));
    }
  }
  for (let i = path.length - 1; i >= 0; i--) update(path[i]);
}

// Build cards for a proven OR node; returns its claim.
function claimOf(n) {
  if (n.ref) return claimOf(n.ref);
  if (n.leaf) return n.leaf;
  if (n.cardClaim) return n.cardClaim;
  const a = n.children.find((c) => c.pn === 0);
  const kids = a.children ? a.children.map(claimOf) : [];
  const M2 = new Set(n.M); M2.add(a.p);
  const cs = claims(n.M, n.B, n.t, n.t - 1).byP.get(a.p);
  n.cardClaim = makeCard(a.p, M2, new Set(a.K), cs, kids);
  return n.cardClaim;
}

// ---------------------------------------------------------------- root
// Black's first stone at the paper's (8,8). Claims needing only that stone: single-requirement cards on it.
const first = S.key(8 + OFF, 8 + OFF);
const cs = [];
for (const e of pool) {
  if (e.h > GOAL - 1 || e.A.length !== 1) continue;
  for (const R of RS) {
    const [ax, ay] = S.apply(R, ...e.A[0]);
    cs.push({ node: e.node, F: { a: R.a, b: R.b, c: R.c, d: R.d, tx: S.kx(first) - ax, ty: S.ky(first) - ay }, h: e.h });
  }
}
let inter = null;
for (const c of cs) { const T = placedT(c); if (!inter) inter = new Set(T); else for (const k of inter) if (!T.has(k)) inter.delete(k); }
const K = [...inter].filter((k) => k !== first);
const rootOr = { type: 'or', M: new Set(), B: new Set(), t: GOAL, key: 'root', children: [], pn: 1, dn: 1 };
const rootAnd = { type: 'and', p: first, cs, K, children: null, pn: K.length, dn: 1 };
rootOr.children.push(rootAnd);
if (ONLY) { // a single first reply: make it the only child of the root move
  const b = S.key(S.kx(first) + ONLY[0], S.ky(first) + ONLY[1]);
  if (!K.includes(b)) throw new Error('that reply is already covered by a claim');
  rootAnd.K = [b]; rootAnd.pn = 1;
}
if (POS) {
  const cells = (str) => new Set(str.split(';').filter(Boolean).map((xy) => { const [x, y] = xy.split(',').map(Number); return S.key(x + OFF, y + OFF); }));
  const sub = orNode(cells(POS[0]), cells(POS[1]), +POS[2]);
  const t1 = Date.now(); let last = 0;
  while (sub.pn !== 0 && sub.dn !== 0 && expansions < MAX_EXP) {
    if (!sub.children && !sub.leaf) expandOr(sub); else iterate(sub);
    update(sub);
    if (expansions - last >= 500) { last = expansions; console.log(`  ${expansions} expansions, ${((Date.now() - t1) / 1000).toFixed(0)}s: pn ${sub.pn} dn ${sub.dn}`); }
  }
  if (sub.pn === 0) {
    const c = claimOf(sub);
    console.log(`PROVED position within ${POS[2]}: claim height ${c.h}, ${lines.length} new cards, final ${c.node.newId ?? 'existing card'} (${expansions} expansions)`);
    if (OUT) { writeFileSync(OUT, [globalThis.SNAKY_CERTIFICATE.trim(), ...extraLines, ...lines].join('\n') + '\n'); console.log('wrote ' + OUT); }
  } else console.log(sub.dn === 0 ? `REFUTED position within ${POS[2]} (${expansions} expansions)` : `undecided after ${expansions} expansions: pn ${sub.pn} dn ${sub.dn}`);
  process.exit(0);
}
console.log(`goal ${GOAL}: ${rootAnd.K.length} White replies to search after Black's first stone`);
const t0 = Date.now();
let lastLog = 0;
while (rootOr.pn !== 0 && rootOr.dn !== 0 && expansions < MAX_EXP) {
  iterate(rootOr);
  update(rootOr);
  if (expansions - lastLog >= 500) {
    lastLog = expansions;
    const done = rootAnd.children ? rootAnd.children.filter((c) => c.pn === 0).length : 0;
    const dead = rootAnd.children ? rootAnd.children.filter((c) => c.dn === 0).length : 0;
    console.log(`  ${expansions} expansions, ${((Date.now() - t0) / 1000).toFixed(0)}s: root pn ${rootOr.pn} dn ${rootOr.dn}; first replies proven ${done}/${rootAnd.K.length}, refuted ${dead}`);
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);
if (rootOr.pn === 0) {
  const root = makeCard(first, new Set([first]), new Set(rootAnd.K), cs, rootAnd.children.map(claimOf));
  console.log(`PROVED goal ${GOAL}: final card ${root.node.newId}, height ${root.h}, ${lines.length} new cards (${expansions} expansions, ${secs}s)`);
  if (OUT) { writeFileSync(OUT, [globalThis.SNAKY_CERTIFICATE.trim(), ...extraLines, ...lines].join('\n') + '\n'); console.log('wrote ' + OUT); }
} else if (rootOr.dn === 0) {
  const dead = rootAnd.children.filter((c) => c.dn === 0).map((c) => `(${S.kx([...c.B][0]) - OFF},${S.ky([...c.B][0]) - OFF})`);
  console.log(`REFUTED within these move limits (max K ${MAX_K}): replies ${dead.join(' ')} cannot be handled (${expansions} expansions, ${secs}s)`);
} else console.log(`undecided after ${expansions} expansions (${secs}s): root pn ${rootOr.pn}, dn ${rootOr.dn}`);
