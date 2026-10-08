// Inlines the CSS and scripts into one HTML fragment for single-file hosting.
// Usage: node tools/build-artifact.mjs out.html
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');
let html = read('index.html');
// Links may carry a version stamp (?v=...) from tools/stamp.mjs.
const inline = (re, tag, f) => { if (!re.test(html)) throw new Error('missing link to ' + f); html = html.replace(re, () => `<${tag}>\n${read(f)}</${tag}>`); };
inline(/<link rel="stylesheet" href="css\/style\.css(\?v=[0-9a-f]+)?">/, 'style', 'css/style.css');
for (const f of ['js/certificate.js', 'js/engine.js', 'js/app.js']) {
  inline(new RegExp(`<script src="${f.replace('.', '\\.')}(\\?v=[0-9a-f]+)?"></script>`), 'script', f);
}
// claude.ai builds its own link preview, so drop ours.
html = html.replace(/<meta name="description"[^>]*>\s*|<!-- link previews[^>]*-->\s*|<meta (property="og:|name="twitter:)[^>]*>\s*/g, '');
html = html.replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '')
  .replace(/<meta charset[^>]*>\s*<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<\/head>\s*<body>\s*/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');
writeFileSync(process.argv[2] || 'snaky-in-21.html', html);
