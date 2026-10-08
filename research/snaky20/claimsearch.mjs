// Claim-guided proof search for a shorter Snaky bound.
//
// A position is (Black stones M, White stones B), Black to move, with a budget of t Black moves.
// The claim pool is every card of the paper's certificate (numbered cards, their inline expressions,
// and the six bases), in any of the 8 symmetries and at any offset. A claim (A, T, h) applies when
// A ⊆ M and T ∩ B = ∅; then Black wins within h moves.
//
//   solve(M, B, t):
//     if some claim with h <= t applies: done (leaf).
//     for each candidate Black move p:
//       C = claims with h <= t-1 that apply once p is Black (A ⊆ M ∪ {p}, T ∩ B = ∅)
//       K = (intersection of their envelopes) minus Black stones: the only White replies that kill all of C
//       if every b in K has solve(M+p, B+b, t-1): done, as the combination card (p; C, children)
//
// This is exactly the paper's combination rule (Lemma 3), so each success is a new card the paper's
// verifier can check. White replies outside K need no search: some claim in C survives them, on the
// whole infinite board.
//
import { S, cert, OFF } from './lib.mjs';
import { SYMBOLS } from './symbols.mjs';

export const limits = { MAX_CAND: 8, MAX_K: 6 };

// ---------------------------------------------------------------- claim pool
const roots = new Map(cert.cards.map((c) => [c.root, c.id]));
export const pool = [];
const seenNode = new Set();
function collect(node) {
  if (seenNode.has(node)) return;
  seenNode.add(node);
  if (!node.base) node.kids.forEach((k) => collect(k.node));
  if (node.A.size === 0) return; // card 727: needs nothing but has height 21, never useful here
  const A = [...node.A].map((k) => [S.kx(k), S.ky(k)]);
  pool.push({ node, A, T: node.T, h: node.h });
}
for (const card of cert.cards) collect(card.root);
pool.sort((a, b) => a.h - b.h);
export const RS = Array.from({ length: 8 }, (_, s) => S.codeTransform(s, 0, 0));

// ---------------------------------------------------------------- claims at a position
// Returns { now: best claim applying already (h <= tNow) or null, byP: Map p -> claims needing only p (h <= tNext) }
export function claims(M, B, tNow, tNext) {
  let now = null;
  const byP = new Map();
  const Ml = [...M];
  for (const e of pool) {
    if (e.h > tNow) break;
    for (const R of RS) {
      const rA = e.A.map(([x, y]) => S.apply(R, x, y));
      const ts = new Set();
      const anchors = rA.length >= 2 ? [rA[0], rA[1]] : [rA[0]];
      for (const m of Ml) for (const a of anchors) ts.add(S.key(S.kx(m) - a[0], S.ky(m) - a[1]));
      for (const tk of ts) {
        const tx = S.kx(tk), ty = S.ky(tk);
        let missing = null, ok = true;
        for (const [x, y] of rA) {
          const k = S.key(x + tx, y + ty);
          if (M.has(k)) continue;
          if (missing !== null || B.has(k)) { ok = false; break; }
          missing = k;
        }
        if (!ok) continue;
        if (missing !== null && e.h > tNext) continue;
        const F = { a: R.a, b: R.b, c: R.c, d: R.d, tx, ty };
        for (const b of B) { const q = S.invertPoint(F, S.kx(b), S.ky(b)); if (e.T.has(S.key(q[0], q[1]))) { ok = false; break; } }
        if (!ok) continue;
        const claim = { node: e.node, F, h: e.h };
        if (missing === null) { if (!now || claim.h < now.h) now = claim; }
        else { let arr = byP.get(missing); if (!arr) byP.set(missing, (arr = [])); arr.push(claim); }
      }
    }
  }
  return { now, byP };
}
export const placedT = (c) => { if (!c._T) { c._T = new Set(); for (const k of c.node.T) c._T.add(S.applyKey(c.F, k)); } return c._T; };

// ---------------------------------------------------------------- search
export const memo = new Map();
export const stats = { positions: 0 };
const posKey = (M, B, t) => [...M].sort((a, b) => a - b).join(',') + '|' + [...B].sort((a, b) => a - b).join(',') + '|' + t;

// Black to move; returns a claim (existing placement or new card) winning within t, or null.
export function solve(M, B, t) {
  const key = posKey(M, B, t);
  if (memo.has(key)) return memo.get(key);
  stats.positions++;
  const { now, byP } = claims(M, B, t, t - 1);
  let result = null;
  if (now) result = now;
  else if (t > 1) {
    // Rank Black's candidate moves by how few White replies escape all their claims.
    const cands = [];
    for (const [p, cs] of byP) {
      let inter = null;
      for (const c of cs) { const T = placedT(c); if (!inter) inter = new Set(T); else for (const k of inter) if (!T.has(k)) inter.delete(k); }
      const K = [...inter].filter((k) => k !== p && !M.has(k));
      if (K.length <= limits.MAX_K) cands.push({ p, cs, K });
    }
    cands.sort((a, b) => a.K.length - b.K.length || Math.max(...a.cs.map((c) => c.h)) - Math.max(...b.cs.map((c) => c.h)));
    for (const { p, cs, K } of cands.slice(0, limits.MAX_CAND)) {
      const M2 = new Set(M); M2.add(p);
      const kids = [];
      let ok = true;
      for (const b of K) {
        const B2 = new Set(B); B2.add(b);
        const c = solve(M2, B2, t - 1);
        if (!c) { ok = false; break; }
        kids.push(c);
      }
      if (ok) { result = makeCard(p, M2, new Set(K), cs, kids); break; }
    }
  }
  memo.set(key, result);
  return result;
}

// ---------------------------------------------------------------- card output
// Each new card is written in its own local frame: board coordinates shifted so that the lower-left
// corner of its envelope sits at (LOCAL, LOCAL). A child's envelope lies inside its parent's, so every
// placement between cards comes out with a nonnegative translation, as the paper's format requires.
const LOCAL = 120;
export const lines = [];
let nextId = cert.cards.length;
const sym = (v) => { if (v < 0 || v >= SYMBOLS.length) throw new Error('coordinate out of range: ' + v); return SYMBOLS[v]; };
const inlineId = new Map();
const inlineText = new Map();
for (const card of cert.cards.slice(6)) {
  const words = card.text.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/);
  words.push(')');
  let i = 1;
  const expr = (node) => { i++; let k = 0;
    while (words[i] !== ')') { if (words[i] === '(') { i++; const s = i; const kid = node.kids[k]; expr(kid.node); inlineText.set(kid.node, words.slice(s, i - 1).join(' ')); } else i++; k++; }
    i++; };
  expr(card.root);
}
function cardIdOf(node) {
  if (node.newId != null) return node.newId;
  if (roots.has(node)) return roots.get(node);
  let id = inlineId.get(node);
  if (id == null) { id = nextId++; lines.push(`${id} ${inlineText.get(node)}`); inlineId.set(node, id); }
  return id;
}
// Reference to claim c from a card whose local frame is parentFrame (board -> local).
function ref(c, parentFrame) {
  const learned = c.node.newId != null;
  const id = learned ? c.node.newId : cardIdOf(c.node);
  // node frame -> board -> parent's local frame (a learned card's node frame is the board itself,
  // and its own text is written in its local frame, so undo that first).
  const G = learned ? S.compose(parentFrame, S.compose(c.F, S.translate(-c.node.frame.tx, -c.node.frame.ty)))
    : S.compose(parentFrame, c.F);
  let s = -1;
  for (let k = 0; k < 8; k++) if (RS[k].a === G.a && RS[k].b === G.b && RS[k].c === G.c && RS[k].d === G.d) s = k;
  if (s < 0) throw new Error('not a signed permutation');
  return s === 0 && !G.tx && !G.ty ? String(id) : `${id}:${s}${sym(G.tx)}${sym(G.ty)}`;
}
const placedA = (c) => { if (!c._A) { c._A = new Set(); for (const k of c.node.A) c._A.add(S.applyKey(c.F, k)); } return c._A; };

// The combination card (pivot p; claims cs and per-escape children kids), with its required set and
// envelope computed by the paper's rule (2). M2 is Black's stones including p.
export function makeCard(p, M2, Kset, cs, kids) {
  // Keep just enough claims from cs that their envelopes meet only in Black stones and K
  // (each reply in K has its own child among kids).
  const chosen = [];
  let inter = null;
  for (const c of [...(cs || [])].sort((a, b) => placedT(a).size - placedT(b).size)) {
    const T = placedT(c);
    const next = inter ? new Set([...inter].filter((k) => T.has(k))) : new Set(T);
    if (!inter || next.size < inter.size) { chosen.push(c); inter = next; }
    if ([...inter].every((k) => M2.has(k) || Kset.has(k))) break;
  }
  const children = [...chosen, ...kids];
  const h = 1 + Math.max(...children.map((c) => c.h));
  const A = new Set(), T = new Set([p]);
  let common = null;
  for (const c of children) {
    const Tc = placedT(c);
    for (const k of Tc) T.add(k);
    for (const k of placedA(c)) A.add(k);
    if (!common) common = new Set(Tc); else for (const k of common) if (!Tc.has(k)) common.delete(k);
  }
  for (const k of common) A.add(k);
  A.delete(p);
  for (const k of A) if (!M2.has(k)) throw new Error('combination needs a stone Black does not have');
  let mx = Infinity, my = Infinity;
  for (const k of T) { mx = Math.min(mx, S.kx(k)); my = Math.min(my, S.ky(k)); }
  const frame = S.translate(LOCAL - mx, LOCAL - my);
  const refs = [...new Set(children.map((c) => ref(c, frame)))].join(' '); // may number inline copies, so before our own id
  const id = nextId++;
  const node = { newId: id, h, A, T, frame, base: false, kids: [] };
  const q = S.applyKey(frame, p);
  lines.push(`${id} ${sym(S.kx(q))}${sym(S.ky(q))} ${refs}`);
  return { node, F: S.ID, h };
}

// Adds a new card to the claim pool, so later positions can use it in any symmetry and placement.
export const learnedCount = { n: 0 };
export function learn(claim) {
  const n = claim.node;
  if (n.newId == null || n.learned || !n.A.size) return;
  n.learned = true;
  const entry = { node: n, A: [...n.A].map((k) => [S.kx(k), S.ky(k)]), T: n.T, h: n.h };
  let i = pool.findIndex((e) => e.h > entry.h);
  if (i < 0) i = pool.length;
  pool.splice(i, 0, entry);
  learnedCount.n++;
}
