// Turns the N=20 proof into new certificate cards appended to the paper's 728.
// Each new card is a combination (Lemma 3 of the paper): Black's move as the pivot, and one child claim
// per kind of White reply. Children are existing cards (placed), base cards (a win-in-1), or new cards.
// The whole file is then checked by the paper's verifier with a wider coordinate alphabet (verify20.py).
//
// Usage: node make-certificate.mjs [N=20]   -> writes certificate20.txt
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { S, cert, newGame, winNow, replies } from './lib.mjs';
import { SYMBOLS } from './symbols.mjs';

const N = +(process.argv[2] || 20);
// New cards use board coordinates + SHIFT so that every pivot and translation is nonnegative.
const SHIFT = 16;
const sym = (v) => { if (v < 0 || v >= SYMBOLS.length) throw new Error('coordinate out of range: ' + v); return SYMBOLS[v]; };
const toFrame = S.translate(SHIFT, SHIFT);

const lines = [];           // new certificate lines, in order
let nextId = cert.cards.length;
const roots = new Map(cert.cards.map((c) => [c.root, c.id]));

// Inline expressions cannot be referenced, so each one we need is copied out as its own numbered card.
// The copy is the same expression text in the same frame (its enclosing card's), so it is the same claim.
const inlineText = new Map();
for (const card of cert.cards.slice(6)) {
  const words = card.text.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/);
  words.push(')');
  let i = 1;
  const expr = (node) => {
    i++; // pivot
    let k = 0;
    while (words[i] !== ')') {
      if (words[i] === '(') { i++; const s = i; const kid = node.kids[k]; expr(kid.node); inlineText.set(kid.node, words.slice(s, i - 1).join(' ')); }
      else i++;
      k++;
    }
    i++;
  };
  expr(card.root);
}
const inlineId = new Map();
function cardIdOf(node) {
  if (roots.has(node)) return roots.get(node);
  let id = inlineId.get(node);
  if (id == null) {
    const text = inlineText.get(node);
    if (!text) throw new Error('unknown node');
    id = nextId++;
    lines.push(`${id} ${text}`);
    inlineId.set(node, id);
  }
  return id;
}

// A reference "j:sUV" to node j placed by F (node frame -> board).
function ref(node, F) {
  const id = cardIdOf(node);
  const G = S.compose(toFrame, F);
  let s = -1;
  for (let c = 0; c < 8; c++) { const R = S.codeTransform(c, 0, 0); if (R.a === G.a && R.b === G.b && R.c === G.c && R.d === G.d) s = c; }
  if (s < 0) throw new Error('not a signed permutation');
  if (s === 0 && G.tx === 0 && G.ty === 0) return String(id);
  return `${id}:${s}${sym(G.tx)}${sym(G.ty)}`;
}
const existing = (node, F) => ({ ref: ref(node, F), h: node.h });

// Base card j placed so that it is exactly the Snaky P with missing cell c.
function baseClaim(P, c) {
  const want = new Set(P);
  for (let s = 0; s < 8; s++) {
    const R = S.codeTransform(s, 0, 0);
    for (let j = 0; j < 6; j++) {
      const [sx, sy] = S.apply(R, ...S.SNAKE[j]);
      const F = { ...R, tx: S.kx(c) - sx, ty: S.ky(c) - sy };
      if (S.SNAKE.every(([x, y]) => want.has(S.applyKey(F, S.key(x, y))))) return existing(cert.cards[j].root, F);
    }
  }
  throw new Error('no base placement');
}

const memo = new Map();
const posKey = (g) => [...g.maker].sort((a, b) => a - b).join(',') + '|' + [...g.breaker].sort((a, b) => a - b).join(',');

// Black to move with m stones already played. Returns a claim valid here with height <= N - m.
function claimAt(g) {
  const m = g.makerMoves;
  const w = winNow(g);
  if (w) return baseClaim(w.P, w.cell);
  if (m + g.remainingValue() <= N) return existing(g.cur.node, g.cur.F);
  const key = posKey(g);
  if (memo.has(key)) return memo.get(key);
  const snap = g.snapshot();
  g.makerMove();
  let claim;
  if (g.won) claim = existing(snap.cur.node, snap.cur.F); // unreachable in practice: covered above
  else claim = combine(g);
  g.restore(snap);
  memo.set(key, claim);
  return claim;
}

// White to move, right after Black's pivot. Builds the new card for the position before that pivot.
function combine(g) {
  const pivot = g.history[g.history.length - 1].cell;
  const m = g.makerMoves;
  const kids = new Map(); // ref -> claim
  const { list, expand } = replies(g, N);
  for (const b of list) {
    const snap = g.snapshot();
    g.breakerMove(b);
    const c = claimAt(g);
    g.restore(snap);
    if (c.h > N - m) throw new Error(`child too slow at move ${m}`);
    kids.set(c.ref, c);
  }
  if (!expand) {
    // Every other reply avoids all envelopes, so Black's fastest card survives it.
    const { index } = g.chooseChild(g.cur, null);
    const kid = g.cur.node.kids[index];
    const c = existing(kid.node, S.compose(g.cur.F, kid.G));
    kids.set(c.ref, c);
  }
  const p = S.applyKey(toFrame, pivot);
  const h = 1 + Math.max(...[...kids.values()].map((c) => c.h));
  const id = nextId++;
  lines.push(`${id} ${sym(S.kx(p))}${sym(S.ky(p))} ${[...kids.keys()].join(' ')}`);
  return { ref: String(id), h };
}

const g = newGame();
const root = combine(g); // Black's first stone is the final card's pivot
const original = globalThis.SNAKY_CERTIFICATE.trim();
const text = original + '\n' + lines.join('\n') + '\n';
const out = fileURLToPath(new URL('./certificate20.txt', import.meta.url));
writeFileSync(out, text);
console.log(`wrote ${lines.length} new cards (${inlineId.size} copied inline expressions), final card ${root.ref} with height ${root.h}`);
