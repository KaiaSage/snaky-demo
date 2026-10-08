import { chromium } from 'playwright';
// Renders assets/og.png, the 1200x630 link-preview image: a finished perfect-defense game beside the title.
// Needs Playwright (npm i playwright). Usage: node tools/make-og-image.mjs . assets/og.png
import { resolve } from 'node:path';
const [dir, outPng] = process.argv.slice(2).map((a) => resolve(a));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1300, height: 1100 }, deviceScaleFactor: 2 });
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.goto('file://' + dir + '/index.html'); await p.waitForTimeout(600);
await p.click('#btn-auto');
await p.waitForSelector('#banner:not([hidden])', { timeout: 90000 });
await p.evaluate(() => { document.getElementById('banner').hidden = true; });
await p.waitForTimeout(300);
const bb = await p.locator('#board').boundingBox();
const c = await p.evaluate(() => { const cs=[...document.querySelectorAll('#board circle[r="18.6"]')].map(e=>e.getBoundingClientRect()); const xs=cs.map(r=>r.x+r.width/2), ys=cs.map(r=>r.y+r.height/2); return [(Math.min(...xs)+Math.max(...xs))/2 + scrollX, (Math.min(...ys)+Math.max(...ys))/2 + scrollY]; });
const side = bb.width * 0.72;
const cx = Math.min(Math.max(c[0], bb.x + side/2), bb.x + bb.width - side/2), cy = Math.min(Math.max(c[1], bb.y + side/2), bb.y + bb.height - side/2);
const board = (await p.screenshot({ fullPage: true, clip: { x: cx - side/2, y: cy - side/2, width: side, height: side } })).toString('base64');
const card = await b.newPage({ viewport: { width: 1200, height: 630 } });
await card.setContent(`<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@800&family=Zen+Kaku+Gothic+New:wght@500&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
 body{margin:0;width:1200px;height:630px;background:#e4eae5;display:flex;align-items:center;gap:40px;padding:0 0 0 64px;box-sizing:border-box;overflow:hidden;font-family:"Zen Kaku Gothic New",sans-serif;color:#17201d}
 .t{flex:1;display:grid;gap:22px}
 .eb{font:500 17px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:#4d5b56}
 h1{white-space:nowrap;font:800 92px/0.95 "Shippori Mincho B1",serif;margin:0}
 .seal{display:inline-grid;place-items:center;background:#c3412a;color:#fff6f0;border-radius:14px;padding:0 14px;transform:rotate(-3deg);font-size:.8em}
 p{font-size:27px;line-height:1.35;margin:0;max-width:20em}
 img{width:600px;height:600px;border-radius:6px;margin-right:16px;width:560px;height:560px;box-shadow:0 20px 50px -20px rgba(40,24,6,.6)}
</style></head><body>
<div class="t"><div class="eb">Maker–Breaker · 728 proof cards</div>
<h1>Snaky in <span class="seal">21</span></h1>
<p>Play White against a proven strategy. Black always builds the Snaky hexomino. How long can you hold out?</p></div>
<img src="data:image/png;base64,${board}">
</body></html>`);
await card.waitForTimeout(1500);
await card.screenshot({ path: outPng });
await b.close();
