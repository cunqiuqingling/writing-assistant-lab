import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/site');
const entries = ['index.html', 'assets', 'data', 'js'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of entries) {
  await cp(resolve(root, entry), resolve(out, entry), { recursive: true });
}

let hasVendor = true;
try {
  await stat(resolve(root, 'vendor/jszip/jszip.min.js'));
  await stat(resolve(root, 'vendor/mammoth/mammoth.browser.min.js'));
  await stat(resolve(root, 'vendor/pdfjs/pdf.min.mjs'));
  await stat(resolve(root, 'vendor/pdfjs/pdf.worker.min.mjs'));
} catch {
  hasVendor = false;
}
if (hasVendor) {
  await cp(resolve(root, 'vendor'), resolve(out, 'vendor'), { recursive: true });
} else {
  console.warn('Local vendor libraries are absent. The test site will use pinned CDN fallbacks. Run npm install && npm run vendor before production deployment.');
}

console.log(`Built static site in ${out}.`);
