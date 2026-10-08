// Proves that Black (the paper's card plan, plus: take any win-in-1) finishes Snaky by move N
// against every White play. Usage: node prove.mjs [N=20]
import { S, newGame, winNow, replies } from './lib.mjs';
const N = +(process.argv[2] || 20);
let positions = 0;

// White to move. True if Black finishes by move N in every continuation.
function prove(g) {
  positions++;
  const m = g.makerMoves;
  for (const b of replies(g, N).list) {
    const snap = g.snapshot();
    g.breakerMove(b);
    let ok;
    if (winNow(g)) ok = m + 1 <= N;                        // Black wins at once
    else if (m + g.remainingValue() <= N) ok = true;       // the plan alone finishes in time
    else { g.makerMove(); ok = g.won ? g.won.moves <= N : prove(g); }
    g.restore(snap);
    if (!ok) return false;
  }
  return true;
}
const t = Date.now();
const res = prove(newGame());
console.log(`N=${N}: ${res ? 'PROVED' : 'REFUTED'} (${positions} White-to-move positions, ${((Date.now() - t) / 1000).toFixed(1)}s)`);
process.exitCode = res ? 0 : 1;
