// Inlines the CSS and scripts into one HTML fragment for single-file hosting.
// Usage: node tools/build-artifact.mjs out.html
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${read('css/style.css')}</style>`);
for (const f of ['js/certificate.js', 'js/engine.js', 'js/app.js']) {
  html = html.replace(`<script src="${f}"></script>`, () => `<script>\n${read(f)}</script>`);
}
html = html.replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '')
  .replace(/<meta charset[^>]*>\s*<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<\/head>\s*<body>\s*/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');
writeFileSync(process.argv[2] || 'snaky-in-21.html', html);
