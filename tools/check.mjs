// Node sanity checks: rebuild the certificate and compare with the paper's stated facts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
vm.runInThisContext(readFileSync(here('../js/certificate.js'), 'utf8'));
vm.runInThisContext(readFileSync(here('../js/engine.js'), 'utf8'));
const S = globalThis.Snaky;
const cert = S.load(globalThis.SNAKY_CERTIFICATE);
const { cards } = cert;
const last = cards[727].root;
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
ok(cards.length === 728, '728 cards');
ok(last.A.size === 0, 'A727 empty');
ok(last.T.size === 251, '|T727| = 251');
ok(last.h === 21, 'h727 = 21');
ok([...last.T].every((k) => S.kx(k) >= 0 && S.kx(k) <= 16 && S.ky(k) >= 0 && S.ky(k) <= 16), 'T727 in 17x17');
ok(Math.max(...cards.map((c) => c.root.h)) === 21, 'max height 21');
const table = [[648, 87, 15], [708, 225, 20], [712, 96, 15], [713, 98, 15], [725, 167, 20], [726, 169, 20]];
for (const [j, t, h] of table) ok(cards[j].root.T.size === t && cards[j].root.h === h, `card ${j}: |T|=${t}, h=${h}`);
console.log('policy depth from empty board: smart V =', last.V, ' paper Vf =', last.Vf, ' certificate h =', last.h);
const hist = {};
for (const c of cards) { const d = c.root.h - c.root.V; hist[d] = (hist[d] || 0) + 1; }
console.log('h - V histogram over cards:', hist);
