import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/site');
const requireVendor = process.argv.includes('--require-vendor');
const entries = ['index.html', 'assets', 'data', 'js'];
const optionalFiles = ['_headers'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of entries) {
  await cp(resolve(root, entry), resolve(out, entry), { recursive: true });
}
for (const entry of optionalFiles) {
  try {
    await stat(resolve(root, entry));
    await cp(resolve(root, entry), resolve(out, entry));
  } catch {}
}

const vendorFiles = [
  'vendor/jszip/jszip.min.js',
  'vendor/mammoth/mammoth.browser.min.js',
  'vendor/pdfjs/pdf.min.mjs',
  'vendor/pdfjs/pdf.worker.min.mjs',
  'vendor/tesseract/tesseract.esm.min.js',
  'vendor/tesseract/worker.min.js',
  'vendor/tesseract/lang/eng.traineddata.gz',
  'vendor/manifest.json'
];
let hasVendor = true;
for (const relative of vendorFiles) {
  try { await stat(resolve(root, relative)); }
  catch { hasVendor = false; break; }
}
if (!hasVendor && requireVendor) {
  throw new Error('Production vendor assets are missing. Run npm install --omit=dev and npm run vendor.');
}
if (hasVendor) {
  await cp(resolve(root, 'vendor'), resolve(out, 'vendor'), { recursive: true });
} else {
  console.warn('Vendor assets are absent. This non-production build cannot import EPUB, DOCX or PDF.');
}

console.log(`Built Writing Assistant 0.8.0 static site in ${out}.`);
