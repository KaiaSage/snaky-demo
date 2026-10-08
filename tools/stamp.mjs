// Adds a content hash to every local script and stylesheet link in the pages (js/app.js?v=1a2b3c4d), so a
// browser never pairs a new page with a cached old script. Rerun after changing any of them.
// Usage: node tools/stamp.mjs     (make-twenty.mjs runs it too)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8);
for (const page of ['index.html', 'twenty/index.html']) {
  if (!existsSync(root + page)) continue;
  const dir = page.includes('/') ? page.slice(0, page.lastIndexOf('/') + 1) : '';
  let html = readFileSync(root + page, 'utf8');
  let n = 0;
  html = html.replace(/(src|href)="((?:\.\.\/)?(?:js|css)\/[\w.-]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"/g, (m, attr, path) => {
    n++;
    return `${attr}="${path}?v=${hash(root + dir + path)}"`;
  });
  writeFileSync(root + page, html);
  console.log(`${page}: stamped ${n} links`);
}
