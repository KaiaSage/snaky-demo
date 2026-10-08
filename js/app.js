// UI for the Snaky demo: board, heatmap, Maker's hand, kifu, review and the two explorers.
(() => {
  'use strict';
  const S = window.Snaky;
  const cert = S.load(window.SNAKY_CERTIFICATE);
  const FINAL = cert.cards[cert.cards.length - 1];

  // ---------------------------------------------------------------- geometry
  const N = 19, U = 40, MARGIN = 46;
  const W = MARGIN * 2 + U * (N - 1);
  const LETTERS = 'ABCDEFGHJKLMNOPQRST';
  const px = (x) => MARGIN + x * U;
  const py = (y) => MARGIN + (N - 1 - y) * U;
  const goName = (k) => LETTERS[S.kx(k)] + (S.ky(k) + 1);
  const paperName = (k) => `(${S.kx(k) - 1},${S.ky(k) - 1})`;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const a in attrs) e.setAttribute(a, attrs[a]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
  const store = {
    get(k, d) { try { const v = localStorage.getItem('snaky21.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('snaky21.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  // ---------------------------------------------------------------- state
  const st = {
    mode: 'blind',
    policy: 'smart',
    game: null,
    snaps: [],   // game snapshots taken at every Breaker-to-move position
    log: [],     // one entry per Breaker reply
    busy: false,
    hover: null,
    review: null,
    auto: false,
    autoTimer: null,
    numbers: true,
    heatNums: false,
    lastMaker: null,
    hintCell: null,
    best: store.get('best', 0),
    sound: store.get('sound', true),
  };

  // ---------------------------------------------------------------- sound
  // Synthesised so nothing has to load: a wooden clack for stones, a hiss for the snake.
  let actx = null;
  function audio() {
    if (!st.sound) return null;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function noise(ctx, secs, shape) {
    const n = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * shape(i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }
  function clack(black) {
    const ctx = audio(); if (!ctx) return;
    const t = ctx.currentTime;
    const src = noise(ctx, 0.07, (u) => Math.exp(-u * 9));
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = black ? 1500 : 1900; bp.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = 0.55;
    src.connect(bp).connect(g).connect(ctx.destination);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(black ? 190 : 230, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.06);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(og).connect(ctx.destination);
    src.start(t); o.start(t); o.stop(t + 0.08);
  }
  function hiss() {
    const ctx = audio(); if (!ctx) return;
    const t = ctx.currentTime + 0.9;
    const src = noise(ctx, 0.9, (u) => Math.min(1, u * 8) * (1 - u));
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
    const g = ctx.createGain(); g.gain.value = 0.18;
    src.connect(hp).connect(g).connect(ctx.destination);
    src.start(t);
  }

  // ---------------------------------------------------------------- board skeleton
  const svg = $('board');
  svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
  const defs = el('defs', {}, svg);
  defs.innerHTML = `
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e6bd7b"/><stop offset=".55" stop-color="#d9a964"/><stop offset="1" stop-color="#c58f4b"/>
    </linearGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves="3" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.27  0 0 0 0 0.08  0 0 0 0.55 -0.12"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <radialGradient id="black" cx=".36" cy=".3" r=".75">
      <stop offset="0" stop-color="#6b6b6b"/><stop offset=".35" stop-color="#2a2a2a"/><stop offset="1" stop-color="#050505"/>
    </radialGradient>
    <radialGradient id="white" cx=".36" cy=".3" r=".8">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#ecebe4"/><stop offset="1" stop-color="#b9b5aa"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter>
    <radialGradient id="snakeHead" cx=".4" cy=".35" r=".8">
      <stop offset="0" stop-color="#8fc46a"/><stop offset="1" stop-color="#3f6b2a"/>
    </radialGradient>`;
  el('rect', { x: 0, y: 0, width: W, height: W, fill: 'url(#wood)' }, svg);
  el('rect', { x: 0, y: 0, width: W, height: W, fill: '#000', filter: 'url(#grain)', opacity: .9 }, svg);
  const gGrid = el('g', {}, svg);
  for (let i = 0; i < N; i++) {
    el('line', { x1: px(0), y1: py(i), x2: px(N - 1), y2: py(i), stroke: '#3a2914', 'stroke-width': i === 0 || i === N - 1 ? 1.8 : 1 }, gGrid);
    el('line', { x1: px(i), y1: py(0), x2: px(i), y2: py(N - 1), stroke: '#3a2914', 'stroke-width': i === 0 || i === N - 1 ? 1.8 : 1 }, gGrid);
    const lt = el('text', { x: px(i), y: MARGIN - 24, 'text-anchor': 'middle', class: 'coord' }, gGrid); lt.textContent = LETTERS[i];
    const lb = el('text', { x: px(i), y: W - MARGIN + 34, 'text-anchor': 'middle', class: 'coord' }, gGrid); lb.textContent = LETTERS[i];
    const nl = el('text', { x: MARGIN - 26, y: py(i) + 4.5, 'text-anchor': 'middle', class: 'coord' }, gGrid); nl.textContent = i + 1;
    const nr = el('text', { x: W - MARGIN + 26, y: py(i) + 4.5, 'text-anchor': 'middle', class: 'coord' }, gGrid); nr.textContent = i + 1;
  }
  for (const x of [3, 9, 15]) for (const y of [3, 9, 15]) el('circle', { cx: px(x), cy: py(y), r: 4, fill: '#3a2914' }, gGrid);
  const gEnv = el('g', {}, svg);
  const gHeat = el('g', {}, svg);
  const gPreview = el('g', {}, svg);
  const gStones = el('g', {}, svg);
  const gMarks = el('g', {}, svg);
  const gSnake = el('g', {}, svg);
  const gHover = el('g', { 'pointer-events': 'none' }, svg);

  function stone(color, k, parent, opts = {}) {
    const x = px(S.kx(k)), y = py(S.ky(k));
    const g = el('g', { class: opts.drop ? 'stone-drop' : '' }, parent);
    if (!opts.ghost) el('circle', { cx: x + 1.8, cy: y + 2.6, r: 18.4, fill: 'rgba(30,15,0,.45)', filter: 'url(#shadow)' }, g);
    el('circle', { cx: x, cy: y, r: 18.6, fill: `url(#${color})`, opacity: opts.ghost ? 0.55 : 1 }, g);
    if (opts.num != null) {
      const t = el('text', { x, y: y + 5.2, 'text-anchor': 'middle', class: 'num', fill: color === 'black' ? '#f2f2f2' : '#1a1a1a' }, g);
      t.textContent = opts.num;
      if (opts.num >= 100) t.setAttribute('font-size', '12');
    }
    return g;
  }

  // ---------------------------------------------------------------- analysis helpers
  const replyCache = new WeakMap();
  function analysis(g) {
    // Breaker-to-move analysis of a game position (cached per cur object + stone count).
    const sig = g.history.length;
    let c = replyCache.get(g.cur);
    if (c && c.sig === sig && c.policy === g.policy) return c;
    const rm = g.replyMap();
    let max = rm.base ? rm.base.value : 0;
    for (const v of rm.map.values()) max = Math.max(max, v.value);
    const perfect = [];
    for (const [k, v] of rm.map) if (v.value === max) perfect.push(k);
    c = { sig, policy: g.policy, ...rm, max, perfect, forced: g.makerMoves + max, everywhere: rm.base && rm.base.value === max, wins: g.winningPoints() };
    replyCache.set(g.cur, c);
    return c;
  }
  function freeCellsOutside(g, a) {
    const out = [];
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
      const k = S.key(x, y);
      if (g.isFree(k) && !a.map.has(k)) out.push(k);
    }
    return out;
  }
  function bestReply(g) {
    const a = analysis(g);
    // Prefer perfect replies inside the envelope so the demo stays readable.
    const pool = a.perfect.length ? a.perfect : freeCellsOutside(g, a);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function replyInfo(g, k) {
    const a = analysis(g);
    const v = a.map.get(k);
    const node = g.cur.node;
    if (v) return { blocked: v.blocked, value: v.value, index: v.index, total: node.kids.length };
    return { blocked: 0, value: a.base.value, index: a.base.index, total: node.kids.length };
  }

  // ---------------------------------------------------------------- views
  function viewGame() {
    if (st.review != null) {
      const g = new S.Game(cert, { policy: st.policy });
      g.restore(st.snaps[st.review]);
      return g;
    }
    return st.game;
  }
  const isGlass = () => st.mode === 'glass' || st.review != null;

  function renderBoard() {
    const g = viewGame();
    [gEnv, gHeat, gStones, gMarks, gSnake, gPreview].forEach(clear);
    const breakerTurn = !g.won && !st.busy;
    const glass = isGlass();
    const reviewMove = st.review != null ? st.log[st.review].cell : null;

    if (glass && breakerTurn && !g.cur.node.base) {
      const a = analysis(g);
      const { T } = g.claimCells();
      for (const k of T) {
        if (!g.isFree(k)) continue;
        const x = px(S.kx(k)), y = py(S.ky(k));
        el('rect', { x: x - 5, y: y - 5, width: 10, height: 10, rx: 1.5, fill: '#2d4a80', opacity: .55 }, gEnv);
      }
      const base = a.base.value, span = Math.max(1, a.max - base);
      for (const [k, v] of a.map) {
        if (v.value <= base) continue;
        const x = px(S.kx(k)), y = py(S.ky(k));
        const t = (v.value - base) / span;
        const perfect = v.value === a.max;
        el('rect', { x: x - 15, y: y - 15, width: 30, height: 30, rx: 6, fill: '#c3412a', opacity: perfect ? 0.88 : 0.18 + 0.42 * t }, gHeat);
        if (perfect) el('rect', { x: x - 17.5, y: y - 17.5, width: 35, height: 35, rx: 8, fill: 'none', stroke: '#c3412a', 'stroke-width': 1.5, opacity: .7 }, gHeat);
        if (st.heatNums) {
          const tx = el('text', { x, y: y + 4.2, 'text-anchor': 'middle', class: 'heatnum' }, gHeat);
          tx.textContent = g.makerMoves + v.value;
        }
      }
    }

    // Points where Black could already finish Snaky but its plan won't play.
    if (glass && breakerTurn && !g.cur.node.base) {
      for (const k of analysis(g).wins) {
        const x = px(S.kx(k)), y = py(S.ky(k));
        el('circle', { cx: x, cy: y, r: 11, fill: 'none', stroke: '#3f6b2a', 'stroke-width': 3, 'stroke-dasharray': '3 2.5' }, gHeat);
      }
    }

    // stones, with kifu numbers
    const order = new Map();
    let n = 0;
    for (const h of g.history) order.set(h.cell, { n: ++n, who: h.who });
    const last = g.history.length ? g.history[g.history.length - 1].cell : null;
    for (const [k, o] of order) {
      stone(o.who === 'maker' ? 'black' : 'white', k, gStones, { num: st.numbers ? o.n : null, drop: k === last && st.review == null && st.justPlaced === k });
    }
    st.justPlaced = null;
    if (last != null && !st.numbers) {
      const x = px(S.kx(last)), y = py(S.ky(last));
      el('circle', { cx: x, cy: y, r: 7, fill: 'none', stroke: order.get(last).who === 'maker' ? '#f4f2ea' : '#151515', 'stroke-width': 2 }, gMarks);
    }
    // review: the reply that was actually played
    if (reviewMove != null) {
      stone('white', reviewMove, gMarks, { ghost: true });
      const x = px(S.kx(reviewMove)), y = py(S.ky(reviewMove));
      el('circle', { cx: x, cy: y, r: 22, fill: 'none', stroke: '#2d4a80', 'stroke-width': 3, 'stroke-dasharray': '4 3' }, gMarks);
    }
    // hint
    if (st.hintCell != null && st.review == null) {
      const x = px(S.kx(st.hintCell)), y = py(S.ky(st.hintCell));
      el('circle', { cx: x, cy: y, r: 19, fill: 'none', stroke: '#fff', 'stroke-width': 3, class: 'pivot-pulse' }, gMarks);
    }
    if (g.won) drawSnake(g.won.snake, st.review == null && st.snakeFresh);
    st.snakeFresh = false;
    renderHover();
  }

  function drawSnake(cells, animate) {
    const pts = cells.map((k) => [px(S.kx(k)), py(S.ky(k))]);
    const d = 'M' + pts.map((p) => p.join(',')).join(' L');
    const cls = animate ? 'snake-body' : '';
    el('path', { d, fill: 'none', stroke: '#3f6b2a', 'stroke-width': 17, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .9, class: cls }, gSnake);
    el('path', { d, fill: 'none', stroke: '#8fc46a', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': '2 9', opacity: .95, class: cls }, gSnake);
    // head at the end of the hook, facing away from the body
    const [hx, hy] = pts[pts.length - 1], [bx, by] = pts[pts.length - 2];
    const ang = Math.atan2(hy - by, hx - bx) * 180 / Math.PI;
    const head = el('g', { class: animate ? 'snake-head' : '', transform: `translate(${hx},${hy}) rotate(${ang})` }, gSnake);
    el('path', { d: 'M14,0 l12,0 m-4,0 l5,-4 m-5,4 l5,4', stroke: '#c3412a', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round', class: animate ? 'tongue' : '' }, head);
    el('ellipse', { cx: 2, cy: 0, rx: 16, ry: 12.5, fill: 'url(#snakeHead)', stroke: '#2c4d1d', 'stroke-width': 1.5 }, head);
    for (const s of [-1, 1]) {
      el('circle', { cx: 7, cy: s * 5.5, r: 3.6, fill: '#fffbe8' }, head);
      el('circle', { cx: 8, cy: s * 5.5, r: 1.8, fill: '#111' }, head);
    }
  }

  function renderHover() {
    clear(gHover); clear(gPreview);
    const tip = $('tip');
    const g = viewGame();
    const k = st.hover;
    if (k == null || st.review != null || g.won || st.busy || !g.isFree(k)) { tip.hidden = true; updateCardStates(null); return; }
    stone('white', k, gHover, { ghost: true });
    if (!isGlass()) { tip.hidden = true; return; }
    const info = replyInfo(g, k);
    const kid = g.cur.node.kids[info.index];
    const next = { node: kid.node, F: S.compose(g.cur.F, kid.G) };
    const cells = g.claimCells(next);
    for (const c of cells.T) {
      const x = px(S.kx(c)), y = py(S.ky(c));
      el('rect', { x: x - 19, y: y - 19, width: 38, height: 38, rx: 4, fill: 'rgba(45,74,128,.13)', stroke: 'rgba(45,74,128,.45)', 'stroke-width': 1 }, gPreview);
    }
    for (const c of cells.A) {
      el('circle', { cx: px(S.kx(c)), cy: py(S.ky(c)), r: 21.5, fill: 'none', stroke: '#f2c14e', 'stroke-width': 3 }, gPreview);
    }
    const pv = cells.pivot;
    el('circle', { cx: px(S.kx(pv)), cy: py(S.ky(pv)), r: 15, fill: 'none', stroke: '#c3412a', 'stroke-width': 3, class: 'pivot-pulse' }, gPreview);
    updateCardStates(k, info);
    const a = analysis(g);
    const finish = g.makerMoves + info.value;
    const delta = a.forced - finish;
    const ignored = analysis(g).wins.includes(k) ? '<br>Black could win here right now, but its plan won’t play it.' : '';
    tip.innerHTML = `<b>${goName(k)}</b> · paper ${paperName(k)}${ignored}<br>` +
      (info.blocked ? `Blocks ${info.blocked} of ${info.total} cards.` : 'Blocks none of Black’s cards.') +
      ` Black switches to <b>${S.kidLabel(kid)}</b> and next threatens <b>${goName(pv)}</b>.<br>` +
      (delta === 0 ? `Keeps the line: perfect play still lasts to move ${finish}.` : `Black then wins by move ${finish} at the latest (−${delta}).`);
    tip.hidden = false;
    placeTip(tip, g, k, [cells.pivot, ...cells.A]);
  }

  // Put the tooltip where it hides the fewest stones and highlighted points.
  function placeTip(tip, g, k, marks) {
    const rect = svg.getBoundingClientRect();
    const sc = rect.width / W;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const cx = px(S.kx(k)) * sc, cy = py(S.ky(k)) * sc;
    const pts = [];
    for (const c of g.maker) pts.push([c, 3]);
    for (const c of g.breaker) pts.push([c, 3]);
    for (const c of marks) pts.push([c, 2]);
    pts.push([k, 50]);
    const r = 20 * sc; // stone radius on screen
    let best = null;
    for (const d of [1, 2.5, 4.5]) {
      const gap = d * U * sc;
      for (const [ox, oy] of [[gap, gap * .5], [gap, -th - gap * .5], [-tw - gap, gap * .5], [-tw - gap, -th - gap * .5], [-tw / 2, gap], [-tw / 2, -th - gap]]) {
        const left = Math.min(Math.max(0, cx + ox), rect.width - tw);
        const top = Math.min(Math.max(0, cy + oy), rect.height - th);
        let cost = d * 0.6;
        for (const [c, w] of pts) {
          const x = px(S.kx(c)) * sc, y = py(S.ky(c)) * sc;
          if (x > left - r && x < left + tw + r && y > top - r && y < top + th + r) cost += w;
        }
        if (!best || cost < best.cost) best = { cost, left, top };
      }
    }
    tip.style.left = best.left + 'px';
    tip.style.top = best.top + 'px';
  }

  // ---------------------------------------------------------------- Maker's hand (cards)
  let cardEls = [];
  function renderCards() {
    const box = $('cards');
    clear(box); cardEls = [];
    const g = viewGame();
    const note = $('hand-note');
    if (g.won) { note.textContent = `Snaky completed on Black's move ${g.won.moves}.`; return; }
    if (st.busy || g.cur.node.base) { note.textContent = 'Black is choosing…'; return; }
    const node = g.cur.node;
    const a = analysis(g);
    const minV = Math.min(...node.kids.map((kd) => (g.policy === 'paper' ? kd.node.Vf : kd.node.V)));
    note.textContent = `Black just played ${goName(g.claimCells().pivot)}. It holds ${node.kids.length} card${node.kids.length > 1 ? 's' : ''}; any card whose envelope you avoid stays live, and Black plays the fastest live one. ` +
      (a.everywhere ? 'Every card here is equally slow, so any reply keeps the line.' : `Hover a cell to see which cards it kills.`);
    // shared viewport: bounding box of the parent envelope
    const T = g.claimCells().T;
    let x0 = 99, y0 = 99, x1 = -99, y1 = -99;
    for (const k of T) { x0 = Math.min(x0, S.kx(k)); x1 = Math.max(x1, S.kx(k)); y0 = Math.min(y0, S.ky(k)); y1 = Math.max(y1, S.ky(k)); }
    const span = Math.max(x1 - x0, y1 - y0) + 1;
    node.kids.forEach((kid, i) => {
      const v = g.policy === 'paper' ? kid.node.Vf : kid.node.V;
      const card = document.createElement('div');
      card.className = 'card' + (v === minV ? ' fast' : '');
      const cv = document.createElement('canvas');
      const P = 120; cv.width = P; cv.height = P;
      card.appendChild(cv);
      const cap = document.createElement('div');
      cap.className = 'cn';
      cap.innerHTML = `<b>${S.kidLabel(kid)}</b><span>h${kid.node.h}</span>`;
      card.appendChild(cap);
      card.title = describeStep(S.kidLabel(kid), kid.node.h);
      box.appendChild(card);
      cardEls.push(card);
      const placed = { node: kid.node, F: S.compose(g.cur.F, kid.G) };
      drawMini(cv, g, g.claimCells(placed), x0 + (x1 - x0 + 1 - span) / 2, y0 + (y1 - y0 + 1 - span) / 2, span);
    });
    updateCardStates(st.hover);
  }

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawMini(cv, g, cells, ox, oy, span) {
    const ctx = cv.getContext('2d');
    const P = cv.width, c = P / span;
    ctx.fillStyle = '#e0b673'; ctx.fillRect(0, 0, P, P);
    const X = (x) => (x - ox) * c, Y = (y) => (oy + span - 1 - y) * c;
    const req = new Set(cells.A);
    ctx.fillStyle = 'rgba(45,74,128,.6)';
    for (const k of cells.T) if (!req.has(k)) ctx.fillRect(X(S.kx(k)) + c * .2, Y(S.ky(k)) + c * .2, c * .6, c * .6);
    const dot = (k, fill, r) => { ctx.beginPath(); ctx.arc(X(S.kx(k)) + c / 2, Y(S.ky(k)) + c / 2, c * r, 0, 7); ctx.fillStyle = fill; ctx.fill(); };
    // Black stones this card requires get a gold halo; other Black stones are faded.
    for (const k of g.maker) if (inView(k) && !req.has(k)) dot(k, 'rgba(17,17,17,.4)', .3);
    for (const k of req) if (inView(k)) { dot(k, '#f2c14e', .62); dot(k, '#111', .44); }
    for (const k of g.breaker) if (inView(k)) { dot(k, '#7d7a72', .44); dot(k, '#f4f2ea', .36); }
    ctx.beginPath(); ctx.arc(X(S.kx(cells.pivot)) + c / 2, Y(S.ky(cells.pivot)) + c / 2, c * .4, 0, 7);
    ctx.lineWidth = Math.max(1.5, c * .18); ctx.strokeStyle = '#c3412a'; ctx.stroke();
    function inView(k) { const x = S.kx(k), y = S.ky(k); return x >= ox && x < ox + span && y >= oy && y < oy + span; }
  }

  function updateCardStates(k, info) {
    if (!cardEls.length) return;
    const g = viewGame();
    if (g.won || st.busy) return;
    let blocked = new Set(), chosen = -1;
    if (k != null && isGlass()) {
      const { blocked: b, index } = g.chooseChild(g.cur, k);
      blocked = new Set(b); chosen = index;
    } else if (st.review != null) {
      const { blocked: b, index } = g.chooseChild(g.cur, st.log[st.review].cell);
      blocked = new Set(b); chosen = index;
    }
    cardEls.forEach((c, i) => {
      c.classList.toggle('blocked', blocked.has(i));
      c.classList.toggle('chosen', i === chosen);
    });
  }

  // ---------------------------------------------------------------- side panel
  function renderPanel() {
    const g = viewGame();
    const glass = isGlass();
    $('mode-glass').setAttribute('aria-selected', st.mode === 'glass');
    $('mode-blind').setAttribute('aria-selected', st.mode === 'blind');
    $('mode-note').textContent = st.mode === 'glass'
      ? 'You can see Black’s cards, the envelope it needs clear, and how much every reply costs it.'
      : 'No help. Hold out until Black’s 21st stone to win.' + (st.best ? ` Your best: ${st.best}.` : '');
    $('glass').hidden = !glass;
    $('legend').style.visibility = glass ? 'visible' : 'hidden';
    $('btn-hint').hidden = !glass || st.review != null;
    $('btn-auto').hidden = st.review != null;
    $('btn-undo').disabled = !st.snaps.length || st.busy || st.auto || st.review != null;
    $('btn-auto').classList.toggle('on', st.auto);
    $('btn-auto').textContent = st.auto ? 'Stop' : 'Watch perfect defense';

    $('moves').textContent = g.makerMoves;
    // forced total for the pips
    let forced = g.won ? g.won.moves : (!st.busy && !g.cur.node.base ? analysis(g).forced : null);
    if (forced == null) forced = st.lastForced || 21;
    st.lastForced = forced;
    const fb = $('forced-box');
    fb.hidden = !glass;
    $('forced').textContent = g.won ? `won on ${g.won.moves}` : `move ${forced}`;
    fb.classList.toggle('lost', forced < 21);
    const pips = $('pips');
    clear(pips);
    for (let i = 1; i <= 21; i++) {
      const p = document.createElement('i');
      p.className = 'pip' + (i <= g.makerMoves ? ' done' : glass ? (i <= forced ? ' todo' : ' lost') : '');
      pips.appendChild(p);
    }
    const status = $('status');
    if (g.won) {
      const m = g.won.moves;
      status.innerHTML = m === 21 ? 'Black needed all 21 moves. That is a perfect defense.' : `Snaky on Black’s move ${m}. <b>${21 - m} short</b> of the full 21.`;
    } else if (st.review != null) {
      status.textContent = 'Reviewing. Hot cells were the replies that slowed Black down most.';
    } else if (st.busy) {
      status.textContent = 'Black is playing…';
    } else if (glass) {
      const a = analysis(g), np = a.perfect.length;
      status.innerHTML = forced === 21 ? (a.everywhere ? 'Your move. Every reply keeps the 21 line here.' : `Your move. You are still on the 21 line; ${np} cell${np === 1 ? '' : 's'} keep${np === 1 ? 's' : ''} it.`)
        : `Your move. Perfect play from here makes Black finish on move ${forced}; <b>${21 - forced} lost</b>.`;
      if (a.wins.length) status.innerHTML += ` Black could already win at ${a.wins.map(goName).join(' or ')} (green ring), but its plan won’t play there.`;
    } else {
      status.textContent = 'Your move. Click any empty point.';
    }
    renderKifu();
    renderPath(g);
    if (glass) renderCards();
  }

  const SYMS = ['as printed', 'swap x and y', 'flip x', 'flip x, then swap', 'flip y', 'flip y, then swap', 'flip x and y (half turn)', 'flip x and y, then swap'];
  function describeStep(label, h) {
    const tail = `h${h}: Black wins within ${h} more moves if White stays out of this card's envelope.`;
    let m = /^(\d+)\((\w)(\w)/.exec(label);
    if (m) return `Inline step inside card ${m[1]}, pivot (${S.SYM.indexOf(m[2])},${S.SYM.indexOf(m[3])}) in that card's coordinates.\n${tail}`;
    m = /^(\d+):(\d)(\w)(\w)$/.exec(label);
    if (m) return `Card ${m[1]}, symmetry ${m[2]} (${SYMS[+m[2]]}), shifted by (${S.SYM.indexOf(m[3])},${S.SYM.indexOf(m[4])}).\n${tail}`;
    if (/^\d+$/.test(label)) return `Card ${label}, placed as printed.\n${tail}`;
    return tail;
  }

  function renderPath(g) {
    const ol = $('path');
    clear(ol);
    for (const p of g.path) {
      const li = document.createElement('li');
      if (p.free) li.className = 'free';
      li.innerHTML = `${p.via || p.label}<span class="h">h${p.node.h}</span>`;
      li.title = describeStep(p.via || p.label, p.node.h) + (p.free ? '\nPivot already owned, so Black moved here without spending a stone.' : '');
      ol.appendChild(li);
    }
  }

  function renderKifu() {
    const ol = $('kifu');
    clear(ol);
    const g = st.game;
    let n = 0, bi = 0;
    const done = !!g.won;
    const reviewable = canReview();
    $('kifu-hint').textContent = !st.log.length ? '' : reviewable ? 'Click a move or press ← → to review' : 'Review opens when the game ends';
    for (const h of g.history) {
      n++;
      const li = document.createElement('li');
      let note = '';
      if (h.who === 'maker') {
        note = h.replacement ? 'replacement move' : n === 1 ? 'tengen, card 727' : (h.descents.length ? `free step ${h.descents.join(' → ')}` : '');
        if (g.won && n === g.history.length) note = 'Snaky!';
      } else {
        const e = st.log[bi++];
        if (e && (st.mode === 'glass' || done)) {
          const loss = e.before - e.after;
          note = `blocks ${e.blocked}/${e.of} · ` + (loss ? `<span class="bad">−${loss}</span>` : '<span class="good">holds</span>');
        }
      }
      li.innerHTML = `<span>${n}.</span><span class="st ${h.who === 'maker' ? 'b' : 'w'}"></span><span>${goName(h.cell)}</span><span class="note">${note}</span>`;
      const ri = Math.max(0, Math.min(st.log.length - 1, h.who === 'breaker' ? bi - 1 : bi - 1));
      if (reviewable && st.log.length) { li.style.cursor = 'pointer'; li.dataset.review = ri; }
      if (st.review != null && h.who === 'breaker' && bi - 1 === st.review) li.classList.add('current');
      ol.appendChild(li);
    }
    const cur = ol.querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'nearest' }); else if (st.review == null) ol.scrollTop = ol.scrollHeight;
    const ta = $('sgf-text');
    if (!st.sgfDirty && document.activeElement !== ta) ta.value = toSGF();
  }

  const canReview = () => !!st.game.won || st.mode === 'glass';

  // ---------------------------------------------------------------- tempo graph
  // After each White reply: the move on which Black finishes if White defends perfectly from then on.
  const TG = { w: 640, h: 132, l: 34, r: 14, t: 12, b: 24 };
  function renderTempo() {
    const fig = $('tempo');
    const n = st.log.length;
    fig.hidden = !(canReview() && n);
    if (fig.hidden) return;
    const svgT = $('tempo-svg');
    clear(svgT);
    const vals = [21, ...st.log.map((e) => e.after)];
    const lo = Math.max(1, Math.min(...vals) - 1);
    const X = (i) => TG.l + (i / Math.max(n, 1)) * (TG.w - TG.l - TG.r);
    const Y = (v) => TG.t + ((21 - v) / Math.max(21 - lo, 1)) * (TG.h - TG.t - TG.b);
    const ticks = [...new Set([21, vals[vals.length - 1], lo + 1])].filter((v) => v >= lo && v <= 21);
    for (const v of ticks) {
      el('line', { x1: TG.l, x2: TG.w - TG.r, y1: Y(v), y2: Y(v), class: 't-grid' }, svgT);
      el('text', { x: TG.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, svgT).textContent = v;
    }
    const xl = el('text', { x: TG.l, y: TG.h - 6 }, svgT); xl.textContent = 'White reply →';
    // step line: the value holds until the next reply changes it
    let d = `M${X(0)},${Y(vals[0])}`;
    for (let i = 1; i < vals.length; i++) d += ` H${X(i)} V${Y(vals[i])}`;
    el('path', { d: d + ` V${Y(lo)} H${X(0)} Z`, class: 't-area' }, svgT);
    el('path', { d, class: 't-line' }, svgT);
    if (st.review != null) el('line', { x1: X(st.review + 1), x2: X(st.review + 1), y1: TG.t, y2: TG.h - TG.b, class: 't-cur' }, svgT);
    // markers: hollow = held the line, vermilion = lost moves; label the single biggest loss
    let worst = -1, worstLoss = 0;
    st.log.forEach((e, i) => {
      const loss = e.before - e.after;
      if (loss > worstLoss) { worstLoss = loss; worst = i; }
      el('circle', { cx: X(i + 1), cy: Y(e.after), r: n > 40 ? 3 : 4.5, class: loss ? 't-loss' : 't-ok' }, svgT);
    });
    if (worst >= 0) {
      const tx = el('text', { x: X(worst + 1), y: Y(st.log[worst].after) + 16, 'text-anchor': 'middle', class: 't-lab' }, svgT);
      tx.textContent = `−${worstLoss}`;
    }
    const hoverLine = el('line', { y1: TG.t, y2: TG.h - TG.b, class: 't-hover', visibility: 'hidden' }, svgT);
    const cap = $('tempo-cap');
    const idle = () => {
      const lost = 21 - vals[vals.length - 1];
      cap.textContent = lost ? `Each step down is a reply that let Black finish sooner: ${lost} move${lost > 1 ? 's' : ''} lost in total. Click the graph to review a reply.`
        : 'Every reply so far held the 21 line. Click the graph to review a reply.';
    };
    idle();
    const pick = (ev) => {
      const pt = svgT.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const p = pt.matrixTransform(svgT.getScreenCTM().inverse());
      return Math.max(0, Math.min(n - 1, Math.round((p.x - TG.l) / ((TG.w - TG.l - TG.r) / Math.max(n, 1))) - 1));
    };
    svgT.onpointermove = (ev) => {
      const i = pick(ev), e = st.log[i], loss = e.before - e.after;
      hoverLine.setAttribute('x1', X(i + 1)); hoverLine.setAttribute('x2', X(i + 1)); hoverLine.setAttribute('visibility', 'visible');
      cap.textContent = `Reply ${i + 1}, White ${goName(e.cell)}: ${loss ? `lost ${loss}` : 'held'}. Perfect defence from there ends on move ${e.after}.`;
    };
    svgT.onpointerleave = () => { hoverLine.setAttribute('visibility', 'hidden'); idle(); };
    svgT.onclick = (ev) => startReview(pick(ev));
  }

  // ---------------------------------------------------------------- SGF
  const sgfCoord = (k) => String.fromCharCode(97 + S.kx(k)) + String.fromCharCode(97 + N - 1 - S.ky(k));
  function toSGF() {
    const g = st.game;
    let s = '(;GM[1]FF[4]CA[UTF-8]SZ[19]AP[Snaky in 21]PB[Maker (card 727)]PW[Breaker]';
    if (g.won) s += `RE[B+]C[Snaky on Black move ${g.won.moves}]`;
    s += '\n';
    for (const h of g.history) s += `;${h.who === 'maker' ? 'B' : 'W'}[${sgfCoord(h.cell)}]`;
    return s + ')';
  }
  function loadSGF(text) {
    const moves = [];
    const re = /(?:^|[;\s\]])\s*([BW])\s*\[([a-s]{2})\]/g;
    let m;
    while ((m = re.exec(text))) {
      const x = m[2].charCodeAt(0) - 97, y = N - 1 - (m[2].charCodeAt(1) - 97);
      moves.push({ who: m[1], k: S.key(x, y) });
    }
    const whites = moves.filter((mv) => mv.who === 'W');
    if (!whites.length) return 'No White moves found. Expected entries like ;W[jk].';
    stopAuto();
    st.game = new S.Game(cert, { policy: st.policy });
    st.snaps = []; st.log = []; st.review = null; st.hintCell = null; st.autoUsed = true;
    $('banner').hidden = true;
    st.game.makerMove();
    let used = 0;
    for (const w of whites) {
      if (st.game.won) break;
      if (!st.game.isFree(w.k)) return finishLoad(`Stopped at White ${goName(w.k)}: that point is already taken.`, used);
      recordBreaker(w.k);
      st.game.makerMove();
      used++;
    }
    const blacks = moves.filter((mv) => mv.who === 'B').map((mv) => mv.k);
    const played = st.game.history.filter((h) => h.who === 'maker').map((h) => h.cell);
    const differ = blacks.length && blacks.some((k, i) => i < played.length && k !== played[i]);
    let msg = `Loaded ${used} White move${used === 1 ? '' : 's'}.`;
    if (used < whites.length) msg += ` The game ended before the last ${whites.length - used}.`;
    if (differ) msg += ' Black answered differently from the file, so its moves were replayed by this strategy.';
    return finishLoad(msg);
  }
  function finishLoad(msg) {
    if (st.game.won) st.snakeFresh = true;
    st.sgfDirty = false;
    render();
    return msg;
  }

  function renderReview() {
    const box = $('review');
    box.hidden = st.review == null;
    if (st.review == null) return;
    const sl = $('rv-slider');
    sl.max = st.log.length - 1;
    sl.value = st.review;
    const e = st.log[st.review];
    const loss = e.before - e.after;
    const g = viewGame();
    const a = analysis(g);
    $('rv-text').innerHTML = `Reply ${st.review + 1} of ${st.log.length}: White ${goName(e.cell)} blocked ${e.blocked} of ${e.of} cards. ` +
      (loss ? `It cost ${loss} move${loss > 1 ? 's' : ''}; perfect play was any of ${a.perfect.length} hot cells.` : 'It kept the line.') +
      ' Resume from here to try another reply.';
  }

  function render() {
    renderBoard();
    renderPanel();
    renderReview();
    renderTempo();
  }

  // ---------------------------------------------------------------- game flow
  function newGame() {
    stopAuto();
    st.game = new S.Game(cert, { policy: st.policy });
    st.snaps = []; st.log = []; st.review = null; st.hintCell = null; st.autoUsed = false;
    st.sgfDirty = false; $('sgf-msg').textContent = '';
    $('banner').hidden = true;
    makerTurn(120);
  }

  function makerTurn(delay = 420) {
    st.busy = true;
    render();
    setTimeout(() => {
      const mv = st.game.makerMove();
      st.lastMaker = mv;
      st.justPlaced = mv.cell;
      st.busy = false;
      clack(true);
      if (st.game.won) onWin();
      render();
      if (st.auto && !st.game.won) st.autoTimer = setTimeout(autoStep, 520);
    }, reduceMotion() ? 0 : delay);
  }
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function breakerPlay(k) {
    const g = st.game;
    if (st.busy || g.won || st.review != null || !g.isFree(k)) return;
    recordBreaker(k);
    clack(false);
    st.hover = null; st.hintCell = null;
    st.justPlaced = k;
    makerTurn();
  }
  function recordBreaker(k) {
    const g = st.game;
    const a = analysis(g);
    const info = replyInfo(g, k);
    st.snaps.push(g.snapshot());
    g.breakerMove(k);
    st.log.push({ cell: k, before: a.forced, after: g.makerMoves + info.value, blocked: info.blocked, of: info.total });
  }

  // Rewind to the position before reply i and keep playing from there.
  function resumeFrom(i) {
    stopAuto();
    st.game.restore(st.snaps[i]);
    st.snaps = st.snaps.slice(0, i);
    st.log = st.log.slice(0, i);
    st.review = null; st.hintCell = null;
    st.autoUsed = true; // a resumed game doesn't count toward the blind record
    $('banner').hidden = true;
    render();
  }

  function onWin() {
    st.snakeFresh = true;
    hiss();
    const m = st.game.won.moves;
    const watched = st.autoUsed;
    if (st.mode === 'blind' && !watched && m > st.best) { st.best = m; store.set('best', m); }
    stopAuto();
    const b = $('banner');
    const perfect = m === 21;
    b.innerHTML = `<h3>${perfect ? 'All 21.' : 'Snaky.'}</h3>` +
      `<p>${perfect ? (watched ? 'That is the longest any defense can last against this proof.' : 'You found a perfect defense. Black needed every move the proof allows.')
        : `Black completed the shape on move ${m}. A perfect defense lasts to 21.`}</p>` +
      `<div class="row"><button class="btn" id="bn-review">Review the game</button><button class="btn btn-primary" id="bn-new">Play again</button><button class="btn" id="bn-close">Close</button></div>`;
    // Keep the banner off the snake.
    const sy = st.game.won.snake.reduce((t, k) => t + S.ky(k), 0) / 6;
    b.style.top = sy < 9 ? '28%' : '72%';
    b.hidden = false;
    $('bn-review').onclick = () => { b.hidden = true; startReview(); };
    $('bn-new').onclick = newGame;
    $('bn-close').onclick = () => { b.hidden = true; };
  }

  function startReview(i) {
    if (!st.log.length) return;
    let idx = i;
    if (idx == null) {
      // jump to the first reply that lost time, if any
      idx = st.log.findIndex((e) => e.before > e.after);
      if (idx < 0) idx = 0;
    }
    st.review = idx;
    $('banner').hidden = true;
    render();
  }

  function undo() {
    if (!st.snaps.length || st.busy || st.auto) return;
    st.game.restore(st.snaps.pop());
    st.log.pop();
    st.review = null; st.hintCell = null;
    $('banner').hidden = true;
    render();
  }

  function autoStep() {
    if (!st.auto || st.game.won || st.busy) return;
    breakerPlay(bestReply(st.game));
  }
  function stopAuto() { st.auto = false; clearTimeout(st.autoTimer); }

  // ---------------------------------------------------------------- input
  function cellFromEvent(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const x = Math.round((p.x - MARGIN) / U), y = N - 1 - Math.round((p.y - MARGIN) / U);
    if (x < 0 || y < 0 || x >= N || y >= N) return null;
    return S.key(x, y);
  }
  svg.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'touch') return;
    const k = cellFromEvent(ev);
    if (k !== st.hover) { st.hover = k; renderHover(); }
  });
  svg.addEventListener('pointerleave', () => { st.hover = null; renderHover(); });
  svg.addEventListener('click', (ev) => {
    const k = cellFromEvent(ev);
    if (k == null || st.auto) return;
    // On touch screens in glass mode the first tap previews, the second plays.
    if (st.lastPointer === 'touch' && isGlass() && st.hover !== k && st.game.isFree(k) && st.review == null) {
      st.hover = k; renderHover(); return;
    }
    breakerPlay(k);
  });
  svg.addEventListener('pointerdown', (ev) => { st.lastPointer = ev.pointerType; });

  $('btn-new').onclick = newGame;
  $('btn-undo').onclick = undo;
  $('btn-hint').onclick = () => {
    if (st.busy || st.game.won) return;
    st.hintCell = bestReply(st.game);
    renderBoard();
  };
  $('btn-auto').onclick = () => {
    if (st.auto) { stopAuto(); render(); return; }
    if (st.game.won) newGame();
    st.auto = true; st.autoUsed = true;
    if (st.busy) return;
    render();
    autoStep();
  };
  function setMode(m) {
    if (st.mode === m) return;
    st.mode = m;
    stopAuto();
    newGame();
  }
  $('mode-glass').onclick = () => setMode('glass');
  $('mode-blind').onclick = () => setMode('blind');
  $('opt-sound').checked = st.sound;
  $('opt-sound').onchange = (e) => { st.sound = e.target.checked; store.set('sound', st.sound); };
  $('opt-numbers').onchange = (e) => { st.numbers = e.target.checked; renderBoard(); };
  $('opt-heatnums').onchange = (e) => { st.heatNums = e.target.checked; renderBoard(); };
  $('opt-paper').onchange = (e) => { st.policy = e.target.checked ? 'paper' : 'smart'; newGame(); };
  $('rv-slider').oninput = (e) => { st.review = +e.target.value; render(); };
  $('rv-prev').onclick = () => { if (st.review > 0) { st.review--; render(); } };
  $('rv-next').onclick = () => { if (st.review < st.log.length - 1) { st.review++; render(); } };
  $('rv-exit').onclick = () => { st.review = null; render(); };
  $('rv-resume').onclick = () => { if (st.review != null) resumeFrom(st.review); };
  $('sgf-text').addEventListener('input', () => { st.sgfDirty = true; });
  $('sgf-copy').onclick = () => {
    const ta = $('sgf-text');
    ta.value = toSGF(); st.sgfDirty = false;
    const done = () => { $('sgf-msg').textContent = 'Copied.'; };
    const fallback = () => { ta.focus(); ta.select(); $('sgf-msg').textContent = 'Selected. Press Ctrl+C or ⌘C to copy.'; };
    try { navigator.clipboard.writeText(ta.value).then(done, fallback); } catch (e) { fallback(); }
  };
  $('sgf-load').onclick = () => { $('sgf-msg').textContent = loadSGF($('sgf-text').value); };
  $('kifu').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li && li.dataset.review != null) startReview(+li.dataset.review);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (st.review == null) {
      if (e.key === 'ArrowLeft' && canReview() && st.log.length && !st.busy) { e.preventDefault(); startReview(st.log.length - 1); }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
    if (e.key === 'ArrowLeft') $('rv-prev').click();
    if (e.key === 'ArrowRight') { if (st.review === st.log.length - 1) $('rv-exit').click(); else $('rv-next').click(); }
    if (e.key === 'Escape') $('rv-exit').click();
  });

  // ---------------------------------------------------------------- hero figure
  (function heroFigure() {
    const fig = document.querySelector('.snaky-figure svg');
    const g = fig.querySelector('.fig-grid');
    const s = 38, ox = 30, oy = 20;
    for (let x = 0; x < 5; x++) el('line', { x1: ox + x * s, y1: oy - 16, x2: ox + x * s, y2: oy + s + 16, stroke: 'currentColor', 'stroke-opacity': .3 }, g);
    for (let y = 0; y < 2; y++) el('line', { x1: ox - 16, y1: oy + y * s, x2: ox + 4 * s + 16, y2: oy + y * s, stroke: 'currentColor', 'stroke-opacity': .3 }, g);
    S.SNAKE.forEach(([x, y], i) => {
      const cx = ox + x * s, cy = oy + (1 - y) * s;
      el('circle', { cx: cx + 1.2, cy: cy + 1.8, r: 14, fill: 'rgba(0,0,0,.3)' }, g);
      el('circle', { cx, cy, r: 14, fill: 'url(#heroBlack)' }, g);
    });
    const d = el('defs', {}, fig);
    d.innerHTML = '<radialGradient id="heroBlack" cx=".36" cy=".3" r=".75"><stop offset="0" stop-color="#6b6b6b"/><stop offset=".35" stop-color="#2a2a2a"/><stop offset="1" stop-color="#050505"/></radialGradient>';
    fig.setAttribute('viewBox', '0 0 220 76');
    fig.style.color = 'var(--ink)';
  })();

  // ---------------------------------------------------------------- facts
  (function facts() {
    let tight = 0;
    for (const c of cert.cards) if (c.root.V === c.root.h) tight++;
    $('fact').textContent = `Checked in your browser just now: the rebuilt card 727 has A = ∅, |T| = ${FINAL.root.T.size}, h = ${FINAL.root.h}. ` +
      `For ${tight} of ${cert.cards.length} cards, a perfect White can force the full height h, so 21 is exactly how long this strategy can be made to last. Random play lasts about 7.`;
  })();

  // ---------------------------------------------------------------- squeeze explorer
  const sq = { k: 0, timer: null };
  function drawSqueeze() {
    const cv = $('sq-canvas'), ctx = cv.getContext('2d');
    const P = cv.width, c = P / 17;
    const root = FINAL.root;
    ctx.fillStyle = '#e0b673'; ctx.fillRect(0, 0, P, P);
    ctx.strokeStyle = 'rgba(58,41,20,.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 17; i++) {
      ctx.beginPath(); ctx.moveTo(c / 2, c / 2 + i * c); ctx.lineTo(P - c / 2, c / 2 + i * c); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c / 2 + i * c, c / 2); ctx.lineTo(c / 2 + i * c, P - c / 2); ctx.stroke();
    }
    let common = new Set(root.T);
    for (let i = 0; i < sq.k; i++) for (const k of common) if (!root.kids[i].T.has(k)) common.delete(k);
    const X = (k) => S.kx(k) * c, Y = (k) => (16 - S.ky(k)) * c;
    ctx.fillStyle = 'rgba(45,74,128,.22)';
    for (const k of root.T) ctx.fillRect(X(k) + c * .3, Y(k) + c * .3, c * .4, c * .4);
    ctx.fillStyle = 'rgba(45,74,128,.9)';
    for (const k of common) ctx.fillRect(X(k) + c * .14, Y(k) + c * .14, c * .72, c * .72);
    if (sq.k > 0) {
      const kid = root.kids[sq.k - 1];
      ctx.strokeStyle = '#c3412a'; ctx.lineWidth = 1.6;
      for (const k of kid.T) ctx.strokeRect(X(k) + c * .08, Y(k) + c * .08, c * .84, c * .84);
    }
    const ck = S.key(8, 8);
    ctx.beginPath(); ctx.arc(X(ck) + c / 2, Y(ck) + c / 2, c * .42, 0, 7);
    const gr = ctx.createRadialGradient(X(ck) + c * .4, Y(ck) + c * .35, 1, X(ck) + c / 2, Y(ck) + c / 2, c * .45);
    gr.addColorStop(0, '#6b6b6b'); gr.addColorStop(1, '#050505'); ctx.fillStyle = gr; ctx.fill();
    $('sq-k').textContent = sq.k;
    $('sq-left').textContent = common.size - 1;
    $('sq-card').textContent = sq.k ? `+ ${root.kids[sq.k - 1].label} (h ${root.kids[sq.k - 1].node.h})` : 'all of T₇₂₇, 251 cells';
    $('sq-slider').value = sq.k;
  }
  $('sq-slider').oninput = (e) => { sq.k = +e.target.value; drawSqueeze(); };
  $('sq-play').onclick = () => {
    if (sq.timer) { clearInterval(sq.timer); sq.timer = null; $('sq-play').textContent = 'Play'; return; }
    if (sq.k >= 32) sq.k = 0;
    $('sq-play').textContent = 'Pause';
    sq.timer = setInterval(() => {
      sq.k++; drawSqueeze();
      if (sq.k >= 32) { clearInterval(sq.timer); sq.timer = null; $('sq-play').textContent = 'Play'; }
    }, 380);
  };

  // ---------------------------------------------------------------- card browser
  const cb = { stack: [], cur: null };
  function openNode(node, label, push) {
    if (push && cb.cur) cb.stack.push(cb.cur);
    cb.cur = { node, label };
    drawCard();
  }
  function drawCard() {
    const { node, label } = cb.cur;
    const cv = $('cb-canvas'), ctx = cv.getContext('2d');
    let x0 = 99, y0 = 99, x1 = -99, y1 = -99;
    for (const k of node.T) { x0 = Math.min(x0, S.kx(k)); x1 = Math.max(x1, S.kx(k)); y0 = Math.min(y0, S.ky(k)); y1 = Math.max(y1, S.ky(k)); }
    const span = Math.max(x1 - x0, y1 - y0) + 3;
    const ox = x0 - 1 - Math.floor((span - (x1 - x0 + 3)) / 2), oy = y0 - 1 - Math.floor((span - (y1 - y0 + 3)) / 2);
    const P = cv.width, c = P / span;
    ctx.fillStyle = '#e0b673'; ctx.fillRect(0, 0, P, P);
    ctx.strokeStyle = 'rgba(58,41,20,.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < span; i++) {
      ctx.beginPath(); ctx.moveTo(c / 2, c / 2 + i * c); ctx.lineTo(P - c / 2, c / 2 + i * c); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c / 2 + i * c, c / 2); ctx.lineTo(c / 2 + i * c, P - c / 2); ctx.stroke();
    }
    const X = (k) => (S.kx(k) - ox) * c + c / 2, Y = (k) => (oy + span - 1 - S.ky(k)) * c + c / 2;
    ctx.fillStyle = 'rgba(45,74,128,.8)';
    for (const k of node.T) if (!node.A.has(k)) ctx.fillRect(X(k) - c * .2, Y(k) - c * .2, c * .4, c * .4);
    for (const k of node.A) {
      ctx.beginPath(); ctx.arc(X(k), Y(k), c * .42, 0, 7);
      const gr = ctx.createRadialGradient(X(k) - c * .12, Y(k) - c * .15, 1, X(k), Y(k), c * .45);
      gr.addColorStop(0, '#6b6b6b'); gr.addColorStop(1, '#050505'); ctx.fillStyle = gr; ctx.fill();
    }
    const pk = node.base ? S.key(node.cell[0], node.cell[1]) : S.key(node.p[0], node.p[1]);
    ctx.beginPath(); ctx.arc(X(pk), Y(pk), c * .38, 0, 7); ctx.lineWidth = Math.max(2, c * .14); ctx.strokeStyle = '#c3412a'; ctx.stroke();

    $('cb-title').textContent = node.base ? `Base card ${node.card}` : (label || `Card ${node.card}`);
    const dl = $('cb-stats');
    const xy = node.base ? `(${node.cell})` : `(${node.p})`;
    dl.innerHTML = `<dt>height h</dt><dd>${node.h}</dd><dt>required |A|</dt><dd>${node.A.size}</dd><dt>envelope |T|</dt><dd>${node.T.size}</dd>` +
      `<dt>${node.base ? 'missing cell' : 'pivot'}</dt><dd>${xy}</dd><dt>children</dt><dd>${node.kids.length}</dd>`;
    const kids = $('cb-kids');
    clear(kids);
    node.kids.forEach((kid) => {
      const b = document.createElement('button');
      b.textContent = `${S.kidLabel(kid)} · h${kid.node.h}`;
      b.onclick = () => openNode(kid.node, kid.inline ? `Card ${kid.node.card}, inline ${kid.label}` : `Card ${kid.card}`, true);
      kids.appendChild(b);
    });
    const line = cert.cards[node.card].text;
    $('cb-line').textContent = node.base ? `Base ${node.card}: S minus ${xy}, envelope S, height 1.` : line;
    $('cb-input').value = node.card;
    $('cb-back').disabled = !cb.stack.length;
  }
  function openCard(j, push = true) {
    j = Math.max(0, Math.min(727, j | 0));
    openNode(cert.cards[j].root, `Card ${j}`, push);
  }
  $('cb-go').onclick = () => openCard(+$('cb-input').value);
  $('cb-input').onkeydown = (e) => { if (e.key === 'Enter') openCard(+e.target.value); };
  $('cb-rand').onclick = () => openCard(6 + Math.floor(Math.random() * 722));
  $('cb-back').onclick = () => { if (cb.stack.length) { cb.cur = cb.stack.pop(); drawCard(); } };

  // ---------------------------------------------------------------- boot
  window.addEventListener('resize', () => renderHover());
  drawSqueeze();
  openCard(6, false);
  newGame();
})();
