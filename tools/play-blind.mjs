// Blind text harness: play White against the Snaky strategy one move per call.
// Shows only the stones, like the page's Blind mode, so a person or an agent can play
// from a terminal without seeing the strategy.
//
//   node tools/play-blind.mjs game.json          show the board (starts a new game if the file is missing)
//   node tools/play-blind.mjs game.json K11      play White at K11; Black replies
//   node tools/play-blind.mjs game.json --sgf    print the game as SGF (paste it into the page to review)
//
// Columns are A–T without I, rows 1–19 from the bottom. The game file stores White's moves.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
vm.runInThisContext(readFileSync(here('../js/certificate.js'), 'utf8'));
vm.runInThisContext(readFileSync(here('../js/engine.js'), 'utf8'));
const S = globalThis.Snaky;
const L = 'ABCDEFGHJKLMNOPQRST';

const [file, arg] = process.argv.slice(2);
if (!file || file === '-h' || file === '--help') {
  console.log(readFileSync(here('./play-blind.mjs'), 'utf8').split('\n').slice(0, 10).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(file ? 0 : 1);
}

const toKey = (s) => {
  const x = L.indexOf(s[0].toUpperCase()), y = +s.slice(1) - 1;
  if (x < 0 || !Number.isInteger(y) || y < 0 || y > 18) throw new Error(`Bad move "${s}". Use a column A–T (no I) and a row 1–19, like K11.`);
  return S.key(x, y);
};
const name = (k) => L[S.kx(k)] + (S.ky(k) + 1);

const cert = S.load(globalThis.SNAKY_CERTIFICATE);
const moves = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
const g = new S.Game(cert);
g.makerMove();
for (const m of moves) { g.breakerMove(toKey(m)); g.makerMove(); }

if (arg === '--sgf') {
  const c = (k) => String.fromCharCode(97 + S.kx(k)) + String.fromCharCode(97 + 18 - S.ky(k));
  let s = '(;GM[1]FF[4]SZ[19]AP[Snaky in 21]PB[Maker (card 727)]PW[Breaker]' + (g.won ? `RE[B+]C[Snaky on Black move ${g.won.moves}]` : '') + '\n';
  for (const h of g.history) s += `;${h.who === 'maker' ? 'B' : 'W'}[${c(h.cell)}]`;
  console.log(s + ')');
  process.exit(0);
}

if (arg) {
  if (g.won) { console.log('This game is over. Start a new one with a different file.'); process.exit(1); }
  let k;
  try { k = toKey(arg); } catch (e) { console.log(e.message); process.exit(1); }
  if (!g.isFree(k)) { console.log(`${arg.toUpperCase()} is already taken. Try another point.`); process.exit(1); }
  g.breakerMove(k);
  g.makerMove();
  moves.push(arg.toUpperCase());
  writeFileSync(file, JSON.stringify(moves));
}

const last = g.history[g.history.length - 1].cell;
let out = '   ' + L.split('').join(' ') + '\n';
for (let y = 18; y >= 0; y--) {
  let row = String(y + 1).padStart(2) + ' ';
  for (let x = 0; x < 19; x++) {
    const k = S.key(x, y);
    row += (g.maker.has(k) ? (k === last ? '@' : 'X') : g.breaker.has(k) ? 'O' : '.') + ' ';
  }
  out += row + String(y + 1) + '\n';
}
out += '   ' + L.split('').join(' ');
console.log(out);
console.log(`Black (X) has ${g.makerMoves} stone${g.makerMoves === 1 ? '' : 's'}; its last move was ${name(last)} (shown as @). You are O.`);
if (g.won) {
  console.log(`GAME OVER: Black completed Snaky on its move ${g.won.moves}. Score: ${g.won.moves} (21 is the maximum).`);
  console.log(`Run with --sgf to export the game.`);
} else {
  console.log('Your move.');
}
