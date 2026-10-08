// Text-only play over plain GET requests, for agents that can fetch pages but can't run JavaScript.
// Black is deterministic, so a whole game is just White's moves: w=<two letters per move, SGF style>.
// Every response lists a ready-made link for each legal reply, because many agent fetch tools
// only follow URLs they have already seen.
//
// Routes:  /            instructions and a link to start
//          /play?w=...  board after White's moves; &glass=1 adds strategy info; &links=0 drops the link list
//                       (errors are 400s that link back to the last valid position)
//          /play?w=...&move=K11   same as appending K11 to w

const S = globalThis.Snaky;
const cert = S.load(globalThis.SNAKY_CERTIFICATE); // ~150 ms, once per isolate (outside the request CPU budget)
const L = 'ABCDEFGHJKLMNOPQRST';
const SITE = 'https://kaiasage.github.io/snaky-demo/';

const goName = (k) => L[S.kx(k)] + (S.ky(k) + 1);
const sgfOf = (k) => String.fromCharCode(97 + S.kx(k)) + String.fromCharCode(97 + 18 - S.ky(k));
const fromSgf = (p) => S.key(p.charCodeAt(0) - 97, 18 - (p.charCodeAt(1) - 97));
function fromGo(s) {
  const m = /^([A-HJ-Ta-hj-t])(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const x = L.indexOf(m[1].toUpperCase()), y = +m[2] - 1;
  return y >= 0 && y < 19 ? S.key(x, y) : null;
}

class BadRequest extends Error {
  constructor(message, back) { super(message); this.back = back; }
}

// Lines are kept short (and URLs get their own line) because some agent fetch tools only quote
// short lines verbatim and paraphrase the rest.
const WRAP = 100;
function wrapList(label, items, sep = ', ') {
  const lines = [];
  let cur = label;
  items.forEach((it, i) => {
    const piece = (i ? sep : ' ') + it;
    if (cur.length + piece.length > WRAP && cur.trim() !== label.trim()) { lines.push(cur + (i < items.length ? sep.trimEnd() : '')); cur = '  ' + it; }
    else cur += piece;
  });
  lines.push(cur);
  return lines;
}

// Replays White's moves. On illegal input, throws BadRequest carrying the longest valid prefix.
function replay(w) {
  const g = new S.Game(cert);
  g.makerMove();
  const log = [];
  for (let i = 0; i < w.length; i += 2) {
    const pair = w.slice(i, i + 2);
    const back = w.slice(0, i);
    if (!/^[a-s]{2}$/.test(pair)) throw new BadRequest(`"w" must be pairs of letters a-s (SGF coordinates); "${pair}" is not.`, back);
    const k = fromSgf(pair);
    if (g.won) throw new BadRequest(`The game was already over before White's move ${i / 2 + 1} (${goName(k)}).`, back);
    if (!g.isFree(k)) throw new BadRequest(`${goName(k)} is already taken (White's move ${i / 2 + 1}).`, back);
    const before = forced(g);
    g.breakerMove(k);
    g.makerMove();
    log.push({ k, lost: before - (g.won ? g.won.moves : forced(g)) });
  }
  return { g, log };
}

// With White to move: the move Black finishes on if White defends perfectly from here.
function forced(g) {
  const { map, base } = g.replyMap();
  let best = base ? base.value : 0;
  for (const v of map.values()) best = Math.max(best, v.value);
  return g.makerMoves + best;
}

function boardText(g) {
  const last = g.history[g.history.length - 1].cell;
  let out = '   ' + L.split('').join(' ') + '\n';
  for (let y = 18; y >= 0; y--) {
    let row = String(y + 1).padStart(2) + ' ';
    for (let x = 0; x < 19; x++) {
      const k = S.key(x, y);
      row += (g.maker.has(k) ? (k === last ? '@' : 'X') : g.breaker.has(k) ? 'O' : '.') + ' ';
    }
    out += row + (y + 1) + '\n';
  }
  return out + '   ' + L.split('').join(' ');
}

function glassText(g, log) {
  const out = ['STRATEGY VIEW (glass=1)'];
  const lost = log.reduce((t, e) => t + e.lost, 0);
  if (g.won) {
    out.push(`LOST: ${lost} move${lost === 1 ? '' : 's'} in total.`);
    return out;
  }
  const { map, base, total } = g.replyMap();
  let best = base.value;
  for (const v of map.values()) best = Math.max(best, v.value);
  const finish = g.makerMoves + best;
  const rows = [...map].filter(([, v]) => v.value > base.value)
    .sort((a, b) => b[1].value - a[1].value || b[1].blocked - a[1].blocked);
  const perfect = rows.filter(([, v]) => v.value === best);
  const everywhere = best === base.value;
  const bestNames = everywhere ? ['any point'] : perfect.map(([k]) => goName(k));
  out.push(`SUMMARY: BEST ${bestNames.slice(0, 3).join(' ')}${bestNames.length > 3 ? ' …' : ''} | FINISH move ${finish} | LOST SO FAR ${lost}`);
  if (log.length) {
    const e = log[log.length - 1];
    out.push(`LAST REPLY: ${goName(e.k)} ${e.lost ? `cost ${e.lost} move${e.lost > 1 ? 's' : ''}` : 'kept the best finish'}.`);
  }
  out.push(`FINISH: with perfect defense from here, Black finishes on move ${finish}.`);
  if (everywhere) {
    out.push('BEST REPLIES: any point. All of Black\'s cards are equally fast here.');
  } else {
    out.push(...wrapList('BEST REPLIES:', bestNames));
    const other = rows.filter(([, v]) => v.value < best).slice(0, 10).map(([k, v]) => `${goName(k)} (${g.makerMoves + v.value})`);
    if (other.length) out.push(...wrapList('ALSO SLOW BLACK (finish move):', other));
    out.push(`ANY OTHER REPLY: Black finishes on move ${g.makerMoves + base.value}.`);
    out.push(`CARDS: Black holds ${total}; the best reply blocks ${perfect[0][1].blocked} of them.`);
  }
  const wins = g.winningPoints();
  if (wins.length) out.push(`IGNORED WIN: Black could win now at ${wins.map(goName).join(' or ')}, but its plan won't play there.`);
  out.push('KEY: a card is one prepared way for Black to win. Your stone blocks a card if it lands in that');
  out.push('  card\'s area. Black always plays on its fastest unblocked card and never looks for other wins.');
  return out;
}

function playUrl(origin, w, opts) {
  return `${origin}/play?w=${w}${opts.links ? '' : '&links=0'}${opts.glass ? '&glass=1' : ''}`;
}

const INTRO = [
  'SNAKY IN 21 · text play. You are White (O). Black (X) is building the Snaky shape:',
  'a line of four plus a two-stone tail that steps over one row, in any rotation or reflection.',
  'Black always wins within 21 stones. Your score is how many stones Black needs; 21 is perfect.',
];

function gameText(origin, w, opts) {
  const { g, log } = replay(w);
  const out = [...INTRO, '', boardText(g), ''];
  const last = g.history[g.history.length - 1].cell;
  const bl = g.history.filter((h) => h.who === 'maker').map((h) => goName(h.cell));
  const wh = g.history.filter((h) => h.who === 'breaker').map((h) => goName(h.cell));
  out.push(`STATUS: Black has ${g.makerMoves} stone${g.makerMoves > 1 ? 's' : ''}. Last Black move: ${goName(last)} (shown as @).` +
    (g.won ? '' : ' Your move.'));
  out.push(...wrapList('BLACK STONES:', bl, ' '));
  if (wh.length) out.push(...wrapList('WHITE STONES:', wh, ' '));
  out.push(...wrapList('MOVES:', g.history.map((h) => (h.who === 'maker' ? 'B ' : 'W ') + goName(h.cell))));
  if (opts.glass) out.push('', ...glassText(g, log));
  out.push('');
  if (g.won) {
    out.push(`GAME OVER. Black completed Snaky on its move ${g.won.moves}.`);
    out.push(`SCORE: ${g.won.moves} of 21`);
    const sgf = '(;GM[1]FF[4]SZ[19]AP[Snaky in 21]PB[Maker (card 727)]PW[Breaker]RE[B+]' +
      g.history.map((h) => `;${h.who === 'maker' ? 'B' : 'W'}[${sgfOf(h.cell)}]`).join('') + ')';
    out.push('', 'SGF (paste into the SGF box on the visual site to review the game):', SITE, sgf);
    out.push('', 'NEW GAME:', playUrl(origin, '', opts));
    return out.join('\n');
  }
  // Always print the canonical URL of this position (any &move= already folded into w).
  const here = playUrl(origin, w, opts);
  let example = null;
  for (const k of [...g.maker].reverse()) { // an empty neighbour of Black's stones makes a plausible example
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = S.kx(k) + dx, y = S.ky(k) + dy;
      if (!example && g.inBoard(x, y) && g.isFree(S.key(x, y))) example = goName(S.key(x, y));
    }
  }
  out.push('POSITION URL:', here);
  out.push('TO PLAY: fetch the position URL with &move=<point> added. For example:');
  // No punctuation right after a URL: agents tend to copy it into the link.
  out.push(`${here}&move=${example}`);
  if (opts.links) {
    out.push('', 'MOVE LINKS (or fetch the link for the point you want):');
    for (let y = 18; y >= 0; y--) for (let x = 0; x < 19; x++) {
      const k = S.key(x, y);
      if (g.isFree(k)) out.push(`${goName(k)} ${playUrl(origin, w + sgfOf(k), opts)}`);
    }
  }
  return out.join('\n');
}

function homeText(origin) {
  return [
    'SNAKY IN 21 · text play',
    '',
    'A Maker-Breaker game on a 19x19 Go board. Black (Maker) plays a proven strategy from the paper',
    '"Snaky in 21 Maker moves" (OpenAI, 2026) and always builds the Snaky shape within 21 stones:',
    '',
    '      . . . X X',
    '      X X X X .      (any rotation or reflection)',
    '',
    'You play White (Breaker). Players alternate one stone at a time; stones never move or get captured.',
    'You cannot stop Black. Your score is the number of stones Black needs; 21 is a perfect defense.',
    'Random play scores about 7. Points are written like Go: column A-T (no I), row 1-19 from the bottom.',
    '',
    'Black follows its prepared plan exactly. It never looks for other ways to win, so it may leave a',
    'finished shape one move away and play elsewhere. A perfect defense takes advantage of that.',
    '',
    'START (recommended for agents: short pages, play by adding &move=K11):',
    `${origin}/play?w=&links=0`,
    '',
    'START WITH THE STRATEGY VIEW (best replies, cards, ignored wins):',
    `${origin}/play?w=&links=0&glass=1`,
    '',
    'START WITH A LINK FOR EVERY MOVE (for fetch tools that only follow links they have seen):',
    `${origin}/play?w=`,
    '',
    'Every page prints its own position URL; the whole game is stored in it, so you can go back or branch.',
    '',
    'THE VISUAL VERSION:',
    SITE,
  ].join('\n');
}

function respond(body, status = 200) {
  return new Response(body + '\n', {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'access-control-allow-origin': '*',
      // A given URL always produces the same page.
      'cache-control': status === 200 ? 'public, max-age=86400' : 'no-store',
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = url.origin;
    if (request.method !== 'GET' && request.method !== 'HEAD') return respond('Only GET is supported.', 405);
    if (url.pathname === '/' || url.pathname === '') return respond(homeText(origin));
    if (url.pathname !== '/play' && url.pathname !== '/textplay') return respond(`Not found. Start at ${origin}/`, 404);
    const p = url.searchParams;
    const opts = { glass: p.get('glass') === '1', links: p.get('links') !== '0' };
    const w0 = (p.get('w') || '').toLowerCase();
    let w = w0;
    try {
      const mv = p.get('move') || p.get('m');
      if (mv) {
        const k = /^[a-s]{2}$/i.test(mv) && !fromGo(mv) ? fromSgf(mv.toLowerCase()) : fromGo(mv);
        if (k == null) throw new BadRequest(`Can't read the move "${mv}". Use a point like K11 (column A-T without I, row 1-19).`, w0);
        w += sgfOf(k);
      }
      return respond(gameText(origin, w, opts));
    } catch (e) {
      if (!(e instanceof BadRequest)) throw e;
      // Point back at the last position that replays cleanly.
      let back = e.back ?? '';
      try { replay(back); } catch { back = ''; }
      const lines = [`ERROR: ${e.message}`, '', 'BACK TO YOUR LAST POSITION:', playUrl(origin, back, opts), '', 'START OVER:', playUrl(origin, '', opts)];
      return respond(lines.join('\n'), 400);
    }
  },
};
