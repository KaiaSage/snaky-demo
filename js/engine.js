// Snaky engine: parses the 21-move certificate, rebuilds every card, and turns the
// final card into a playable Maker policy (Section 4 of the article).
(function (root) {
  'use strict';

  const SYM = '0123456789ABCDEFG';
  const SNAKE = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [4, 1]];

  // Cells are packed into integers so they can live in Sets.
  const OFF = 256;
  const key = (x, y) => (x + OFF) * 1024 + (y + OFF);
  const kx = (k) => Math.floor(k / 1024) - OFF;
  const ky = (k) => (k % 1024) - OFF;

  // ---- placements: F(x, y) = R(x, y) + t with R a signed permutation ----
  const ID = Object.freeze({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

  // Bit 2 negates x, bit 4 negates y, then bit 1 swaps (exactly as in the paper).
  function codeTransform(s, dx, dy) {
    const sx = s & 2 ? -1 : 1;
    const sy = s & 4 ? -1 : 1;
    return s & 1
      ? { a: 0, b: sy, c: sx, d: 0, tx: dx, ty: dy }
      : { a: sx, b: 0, c: 0, d: sy, tx: dx, ty: dy };
  }
  const apply = (F, x, y) => [F.a * x + F.b * y + F.tx, F.c * x + F.d * y + F.ty];
  const applyKey = (F, k) => { const p = apply(F, kx(k), ky(k)); return key(p[0], p[1]); };
  // (F o G)(v) = F(G(v))
  function compose(F, G) {
    return {
      a: F.a * G.a + F.b * G.c, b: F.a * G.b + F.b * G.d,
      c: F.c * G.a + F.d * G.c, d: F.c * G.b + F.d * G.d,
      tx: F.a * G.tx + F.b * G.ty + F.tx, ty: F.c * G.tx + F.d * G.ty + F.ty,
    };
  }
  // R is orthogonal, so R^-1 = R^T.
  function invertPoint(F, x, y) {
    const u = x - F.tx, v = y - F.ty;
    return [F.a * u + F.c * v, F.b * u + F.d * v];
  }
  const translate = (dx, dy) => ({ a: 1, b: 0, c: 0, d: 1, tx: dx, ty: dy });

  // All 8 orientations of Snaky (as offset lists), used to detect wins.
  const ORIENTS = (() => {
    const out = [];
    const seen = new Set();
    for (let s = 0; s < 8; s++) {
      const F = codeTransform(s, 0, 0);
      const cells = SNAKE.map(([x, y]) => apply(F, x, y));
      const sig = cells.map((c) => c.join(',')).sort().join(';');
      if (!seen.has(sig)) { seen.add(sig); out.push(cells); }
    }
    return out;
  })();

  // ---------------------------------------------------------------------
  // Certificate parsing and evaluation (mirrors the verifier in Appendix G)
  // ---------------------------------------------------------------------
  function point(word) {
    if (word.length !== 2) throw new Error('bad point ' + word);
    return [SYM.indexOf(word[0]), SYM.indexOf(word[1])];
  }

  function build(text) {
    const cards = [];
    SNAKE.forEach((s, j) => {
      const T = new Set(SNAKE.map(([x, y]) => key(x, y)));
      const A = new Set(T);
      A.delete(key(s[0], s[1]));
      cards.push({ id: j, text: 'base ' + j, root: { base: true, card: j, cell: s, A, T, h: 1, kids: [] } });
    });

    let nodeCount = 0;
    function expr(it, cardId, depth) {
      const p = point(it.next());
      const node = { base: false, card: cardId, depth, p, kids: [], uid: nodeCount++ };
      for (;;) {
        const word = it.next();
        if (word === ')') break;
        if (word === '(') {
          const sub = expr(it, cardId, depth + 1);
          node.kids.push({ node: sub, G: ID, inline: true, label: '(' + SYM[sub.p[0]] + SYM[sub.p[1]] + ' …)' });
        } else {
          const parts = word.split(':');
          const j = +parts[0];
          if (!(j >= 0 && j < cards.length)) throw new Error('forward reference ' + word);
          let G = ID;
          if (parts.length === 2) {
            const s = +parts[1][0];
            const [dx, dy] = point(parts[1].slice(1));
            G = codeTransform(s, dx, dy);
          }
          node.kids.push({ node: cards[j].root, G, inline: false, label: word, card: j });
        }
      }
      if (!node.kids.length) throw new Error('empty expression');
      // Combination rule (2).
      const pk = key(p[0], p[1]);
      const T = new Set([pk]);
      const A = new Set();
      let inter = null;
      let h = 0;
      for (const kid of node.kids) {
        const kT = new Set();
        for (const k of kid.node.T) kT.add(applyKey(kid.G, k));
        const kA = new Set();
        for (const k of kid.node.A) kA.add(applyKey(kid.G, k));
        kid.T = kT; kid.A = kA;
        for (const k of kT) T.add(k);
        for (const k of kA) A.add(k);
        if (inter === null) inter = new Set(kT);
        else for (const k of inter) if (!kT.has(k)) inter.delete(k);
        h = Math.max(h, kid.node.h);
      }
      for (const k of inter) A.add(k);
      A.delete(pk);
      node.A = A; node.T = T; node.h = h + 1;
      return node;
    }

    const lines = text.trim().split('\n');
    for (const line of lines) {
      const words = line.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/);
      words.push(')');
      let i = 0;
      const it = { next: () => words[i++] };
      const id = +it.next();
      if (id !== cards.length) throw new Error('card out of order ' + id);
      const root = expr(it, id, 0);
      if (i !== words.length) throw new Error('trailing tokens in card ' + id);
      cards.push({ id, text: line, root });
    }
    return { cards, nodeCount };
  }

  // ---------------------------------------------------------------------
  // Policy depth: the certificate's height h is an upper bound. We also compute
  //   V  = moves Breaker can actually force if Maker picks the *fastest* surviving child,
  //   Vf = moves Breaker can force against the paper's literal "first surviving child".
  // Evaluated from the minimal ownership A of each claim, so both are exact
  // descriptions of each policy run on its own certificate tree.
  // ---------------------------------------------------------------------
  function analyse(node) {
    if (node.V !== undefined) return;
    if (node.base) { node.V = 1; node.Vf = 1; return; }
    for (const kid of node.kids) analyse(kid.node);
    const n = node.kids.length;
    const owned = new Set(node.A);
    owned.add(key(node.p[0], node.p[1]));
    // Group Breaker replies by which children they block.
    const blockers = new Map(); // cell -> array of kid indices blocked
    node.kids.forEach((kid, i) => {
      for (const k of kid.T) {
        if (owned.has(k)) continue;
        let arr = blockers.get(k);
        if (!arr) blockers.set(k, (arr = []));
        arr.push(i);
      }
    });
    const evalBlocked = (blocked) => {
      let best = Infinity, bestI = -1, first = -1;
      for (let i = 0; i < n; i++) {
        if (blocked && blocked.has(i)) continue;
        if (first < 0) first = i;
        const v = node.kids[i].node.V;
        if (v < best) { best = v; bestI = i; }
      }
      return { smart: best, first: node.kids[first].node.Vf, bestI, firstI: first };
    };
    let worst = evalBlocked(null);
    let V = worst.smart, Vf = worst.first;
    const classes = new Map();
    for (const [k, arr] of blockers) {
      const sig = arr.join(',');
      let cls = classes.get(sig);
      if (!cls) {
        const r = evalBlocked(new Set(arr));
        cls = { blocked: arr, ...r, cells: [] };
        classes.set(sig, cls);
        V = Math.max(V, r.smart);
        Vf = Math.max(Vf, r.first);
      }
      cls.cells.push(k);
    }
    node.V = V + 1;
    node.Vf = Vf + 1;
  }

  // Inline expressions are named by their card and pivot, e.g. 708(87 …).
  const kidLabel = (kid) => (kid.inline ? kid.node.card + kid.label : kid.label);

  // ---------------------------------------------------------------------
  // Live game against the policy.
  // ---------------------------------------------------------------------
  class Game {
    constructor(cert, opts = {}) {
      this.cert = cert;
      this.size = opts.size || 19;
      this.offset = opts.offset == null ? 1 : opts.offset; // certificate (0,0) -> board (1,1)
      this.policy = opts.policy || 'smart';
      this.reset();
    }

    reset() {
      this.maker = new Set();
      this.breaker = new Set();
      this.history = []; // {who, cell, note}
      const final = this.cert.cards[this.cert.cards.length - 1];
      this.cur = { node: final.root, F: translate(this.offset, this.offset), label: String(final.id) };
      this.path = [{ node: final.root, F: this.cur.F, label: String(final.id), via: null }];
      this.won = null;
      this.makerMoves = 0;
    }

    snapshot() {
      return {
        maker: new Set(this.maker), breaker: new Set(this.breaker), history: this.history.slice(),
        cur: this.cur, path: this.path.slice(), won: this.won, makerMoves: this.makerMoves,
      };
    }
    restore(s) {
      Object.assign(this, {
        maker: new Set(s.maker), breaker: new Set(s.breaker), history: s.history.slice(),
        cur: s.cur, path: s.path.slice(), won: s.won, makerMoves: s.makerMoves,
      });
    }

    inBoard(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }
    isFree(k) { return !this.maker.has(k) && !this.breaker.has(k); }

    // Absolute cells of the current claim.
    claimCells(cur = this.cur) {
      const { node, F } = cur;
      const T = [], A = [];
      for (const k of node.T) T.push(applyKey(F, k));
      for (const k of node.A) A.push(applyKey(F, k));
      const pivot = node.base ? applyKey(F, key(node.cell[0], node.cell[1])) : applyKey(F, key(node.p[0], node.p[1]));
      return { T, A, pivot };
    }

    childAbs(cur, kid) {
      return { node: kid.node, F: compose(cur.F, kid.G), label: kidLabel(kid) };
    }

    kidValue(kid) { return this.policy === 'paper' ? kid.node.Vf : kid.node.V; }

    // Which child the policy picks after Breaker plays absolute cell b (b may be null).
    chooseChild(cur, b) {
      const { node, F } = cur;
      let local = null;
      if (b != null) { const p = invertPoint(F, kx(b), ky(b)); local = key(p[0], p[1]); }
      let pick = -1, best = Infinity;
      const blocked = [];
      node.kids.forEach((kid, i) => {
        if (local != null && kid.T.has(local)) { blocked.push(i); return; }
        if (this.policy === 'paper') { if (pick < 0) pick = i; return; }
        const v = kid.node.V;
        if (v < best) { best = v; pick = i; }
      });
      return { index: pick, blocked };
    }

    // Free points where one more Black stone would complete Snaky. The card policy never looks
    // for these: it only plays its card's next stone, so it can leave a ready win on the board.
    winningPoints() {
      const out = [];
      for (let x = 0; x < this.size; x++) for (let y = 0; y < this.size; y++) {
        const k = key(x, y);
        if (!this.isFree(k)) continue;
        this.maker.add(k);
        if (this.findSnake(k)) out.push(k);
        this.maker.delete(k);
      }
      return out;
    }

    findSnake(k) {
      const x0 = kx(k), y0 = ky(k);
      for (const cells of ORIENTS) {
        for (const [ax, ay] of cells) {
          const ox = x0 - ax, oy = y0 - ay;
          let ok = true;
          for (const [cx, cy] of cells) if (!this.maker.has(key(ox + cx, oy + cy))) { ok = false; break; }
          if (ok) return cells.map(([cx, cy]) => key(ox + cx, oy + cy));
        }
      }
      return null;
    }

    // Replacement move for the literal paper policy: first free cell by
    // max(|x|,|y|) then lexicographic, in certificate coordinates.
    replacementCell() {
      for (let r = 0; r < 64; r++) {
        for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) {
          if (Math.max(Math.abs(x), Math.abs(y)) !== r) continue;
          const bx = x + this.offset, by = y + this.offset;
          if (!this.inBoard(bx, by)) continue;
          const k = key(bx, by);
          if (this.isFree(k)) return k;
        }
      }
      return null;
    }

    // Maker's move. Returns {cell, descents:[...], replacement}.
    makerMove() {
      if (this.won) return null;
      const descents = [];
      let replacement = false;
      let cell;
      for (;;) {
        const { node } = this.cur;
        if (node.base) {
          cell = this.claimCells().pivot;
          break;
        }
        const pivot = this.claimCells().pivot;
        if (this.isFree(pivot)) { cell = pivot; break; }
        if (this.maker.has(pivot)) {
          if (this.policy === 'paper') { cell = this.replacementCell(); replacement = true; break; }
          // Smart policy: the pivot is already ours, so every child is live right now.
          const { index } = this.chooseChild(this.cur, null);
          const kid = node.kids[index];
          descents.push(kidLabel(kid));
          this.cur = this.childAbs(this.cur, kid);
          this.path.push({ ...this.cur, via: kidLabel(kid), free: true });
          continue;
        }
        throw new Error('invariant broken: Breaker owns the pivot');
      }
      if (!this.isFree(cell)) throw new Error('invariant broken: target cell not free');
      this.maker.add(cell);
      this.makerMoves++;
      this.pendingReplacement = replacement;
      this.history.push({ who: 'maker', cell, descents, replacement, label: this.cur.label, node: this.cur.node });
      const snake = this.findSnake(cell);
      if (snake) this.won = { snake, moves: this.makerMoves };
      return { cell, descents, replacement };
    }

    // Breaker reply at absolute cell b, then Maker updates its active claim.
    breakerMove(b) {
      if (this.won) throw new Error('game over');
      if (!this.isFree(b)) throw new Error('occupied');
      this.breaker.add(b);
      const prev = this.cur;
      let info = { blocked: [], index: -1 };
      if (!prev.node.base) {
        info = this.chooseChild(prev, b);
        const kid = prev.node.kids[info.index];
        this.cur = this.childAbs(prev, kid);
        this.path.push({ ...this.cur, via: kidLabel(kid) });
      }
      this.history.push({ who: 'breaker', cell: b, blocked: info.blocked.length, of: prev.node.kids.length });
      return info;
    }

    // Moves Maker still needs from the current (Maker-to-move) claim under this policy.
    remainingValue(cur = this.cur) {
      return this.policy === 'paper' ? cur.node.Vf : cur.node.V;
    }

    // With Breaker to move: for each board cell, what happens if Breaker plays there.
    // Returns Map(cell -> {blocked, total, value, index}) plus the baseline for "elsewhere".
    replyMap() {
      const cur = this.cur;
      const out = new Map();
      if (cur.node.base || this.won) return { map: out, base: null, total: 0 };
      const node = cur.node;
      const base = this.chooseChild(cur, null);
      const baseVal = this.kidValue(node.kids[base.index]);
      const counts = new Map(); // local key -> blocked kid indices
      node.kids.forEach((kid, i) => {
        for (const k of kid.T) {
          let arr = counts.get(k);
          if (!arr) counts.set(k, (arr = []));
          arr.push(i);
        }
      });
      for (const [lk, arr] of counts) {
        const ak = applyKey(cur.F, lk);
        const ax = kx(ak), ay = ky(ak);
        if (!this.inBoard(ax, ay) || !this.isFree(ak)) continue;
        const { index } = this.chooseChild(cur, ak);
        out.set(ak, { blocked: arr.length, value: this.kidValue(node.kids[index]), index });
      }
      return { map: out, base: { value: baseVal, index: base.index }, total: node.kids.length };
    }
  }

  const api = { kidLabel, SYM, SNAKE, ORIENTS, key, kx, ky, ID, codeTransform, apply, applyKey, compose, invertPoint, translate, build, analyse, Game };

  api.load = function (text) {
    const cert = build(text);
    for (const c of cert.cards) analyse(c.root);
    return cert;
  };

  root.Snaky = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
