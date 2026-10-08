// Text-only play over plain GET requests, for agents that can fetch pages but can't run JavaScript.
// Black is deterministic, so a whole game is just White's moves: w=<two letters per move, SGF style>.
// Every response lists a ready-made link for each legal reply, because many agent fetch tools
// only follow URLs they have already seen.
//
// Routes:  /            instructions and a link to start
//          /play?w=...  board after White's moves; &glass=1 adds strategy info; &links=0 drops the link list
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

class BadRequest extends Error {}

// Replays White's moves. Throws BadRequest with a readable message on any illegal input.
function replay(w) {
  if (!/^([a-s]{2})*$/.test(w)) throw new BadRequest(`"w" must be pairs of letters a–s (SGF coordinates), got "${w}".`);
  const g = new S.Game(cert);
  g.makerMove();
  const log = [];
  for (let i = 0; i < w.length; i += 2) {
    const k = fromSgf(w.slice(i, i + 2));
    if (g.won) throw new BadRequest(`The game ended before White's move ${i / 2 + 1} (${goName(k)}).`);
    if (!g.isFree(k)) throw new BadRequest(`White's move ${i / 2 + 1} (${goName(k)}) is on an occupied point.`);
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
  const lines = ['STRATEGY VIEW (glass=1)'];
  const lost = log.reduce((t, e) => t + e.lost, 0);
  if (log.length) {
    const e = log[log.length - 1];
    lines.push(`Your last reply ${goName(e.k)} ${e.lost ? `cost ${e.lost} move${e.lost > 1 ? 's' : ''}` : 'kept the line'}. Moves lost so far: ${lost}.`);
  }
  if (g.won) return lines.join('\n');
  const { map, base, total } = g.replyMap();
  const node = g.cur.node;
  let best = base.value;
  for (const v of map.values()) best = Math.max(best, v.value);
  lines.push(`Black just played ${goName(g.claimCells().pivot)} and holds ${total} card${total > 1 ? 's' : ''} (proof step ${g.cur.label}, height ${node.h}).`);
  lines.push(`With perfect defense from here Black finishes on move ${g.makerMoves + best}.`);
  const rows = [...map].filter(([, v]) => v.value > base.value).sort((a, b) => b[1].value - a[1].value || b[1].blocked - a[1].blocked);
  if (best === base.value) {
    lines.push('Every reply is equally good here: all of Black\'s cards are equally fast.');
  } else {
    const perfect = rows.filter(([, v]) => v.value === best).map(([k, v]) => `${goName(k)} (blocks ${v.blocked}/${total})`);
    lines.push(`Replies that keep that finish: ${perfect.join(', ')}.`);
    const other = rows.filter(([, v]) => v.value < best).slice(0, 12).map(([k, v]) => `${goName(k)}→${g.makerMoves + v.value}`);
    if (other.length) lines.push(`Other replies that slow Black (finish move): ${other.join(', ')}.`);
    lines.push(`Anything else lets Black finish on move ${g.makerMoves + base.value}.`);
  }
  return lines.join('\n');
}

function playUrl(origin, w, opts) {
  return `${origin}/play?w=${w}${opts.glass ? '&glass=1' : ''}${opts.links ? '' : '&links=0'}`;
}

function gameText(origin, w, opts) {
  const { g, log } = replay(w);
  const out = [];
  out.push('SNAKY IN 21 · text play. You are White (O). Black (X) is building the Snaky hexomino:');
  out.push('four in a row plus a two-stone tail that steps one row over at the end, in any rotation or reflection.');
  out.push('Black always succeeds within 21 stones. Your score is how many stones Black needs (21 is perfect).');
  out.push('');
  out.push(boardText(g));
  out.push('');
  const last = g.history[g.history.length - 1].cell;
  out.push(`Black has ${g.makerMoves} stone${g.makerMoves > 1 ? 's' : ''}; its last move was ${goName(last)} (shown as @).`);
  out.push('Moves so far: ' + g.history.map((h) => (h.who === 'maker' ? 'B ' : 'W ') + goName(h.cell)).join(', '));
  if (opts.glass) out.push('', glassText(g, log));
  out.push('');
  if (g.won) {
    out.push(`GAME OVER: Black completed Snaky on its move ${g.won.moves}. Score: ${g.won.moves} of 21.`);
    const sgf = '(;GM[1]FF[4]SZ[19]AP[Snaky in 21]PB[Maker (card 727)]PW[Breaker]RE[B+]' +
      g.history.map((h) => `;${h.who === 'maker' ? 'B' : 'W'}[${sgfOf(h.cell)}]`).join('') + ')';
    out.push('', 'SGF (paste into the SGF box at ' + SITE + ' to review the game):', sgf);
    out.push('', `New game: ${playUrl(origin, '', opts)}`);
    return out.join('\n');
  }
  out.push('Your move. To play a point, fetch its link below, or add &move=<point> (like &move=K11) to this URL.');
  if (opts.links) {
    out.push('');
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
    'A Maker–Breaker game on a 19x19 Go board. Black (Maker) plays a proven strategy from the paper',
    '"Snaky in 21 Maker moves" (OpenAI, 2026) and always builds the Snaky hexomino within 21 stones:',
    '',
    '      . . . X X',
    '      X X X X .      (any rotation or reflection)',
    '',
    'You play White (Breaker). Players alternate one stone at a time; stones never move or get captured.',
    'You cannot stop Black. Your score is the number of stones Black needs; 21 is a perfect defense.',
    'Random play scores about 7.',
    '',
    `Start a game:                      ${origin}/play?w=`,
    `Start with strategy info shown:    ${origin}/play?w=&glass=1`,
    '',
    'Each page shows the board and lists a link for every legal move. Fetch the link for the point you want.',
    'If you can build URLs yourself, add &links=0 for a shorter page and play with &move=K11.',
    'Points are written like Go: column A–T (no I), row 1–19 from the bottom.',
    '',
    `The visual version: ${SITE}`,
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
    let w = (p.get('w') || '').toLowerCase();
    try {
      const mv = p.get('move') || p.get('m');
      if (mv) {
        const k = /^[a-s]{2}$/i.test(mv) && !fromGo(mv) ? fromSgf(mv.toLowerCase()) : fromGo(mv);
        if (k == null) throw new BadRequest(`Can't read the move "${mv}". Use a point like K11 (column A–T without I, row 1–19).`);
        w += sgfOf(k);
      }
      return respond(gameText(origin, w, opts));
    } catch (e) {
      if (!(e instanceof BadRequest)) throw e;
      return respond(`${e.message}\n\nGo back to the previous page and pick another point, or start over: ${origin}/play?w=`, 400);
    }
  },
};
