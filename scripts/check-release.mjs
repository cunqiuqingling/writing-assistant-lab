import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const checkDist = process.argv.includes('--dist');
const sourceOnly = process.argv.includes('--source-only');
const failures = [];
function check(condition, message) { if (!condition) failures.push(message); }
async function text(path) { return readFile(resolve(root, path), 'utf8'); }
async function exists(path, minBytes = 1) {
  try { return (await stat(resolve(root, path))).size >= minBytes; }
  catch { return false; }
}

const index = await text('index.html');
const app = await text('js/app.js');
const importer = await text('js/document-import.js');
const browser = await text('js/browser-ocr.js');
const localOcr = await text('js/local-ocr.js');
const pkg = JSON.parse(await text('package.json'));
const wrangler = await text('wrangler.jsonc');
const headers = await text('_headers');

check(index.includes('<span class="version-badge">0.8.0</span>'), 'public version badge must be 0.8.0');
check(app.includes("APP_VERSION = '0.8.0'"), 'app version must be 0.8.0');
check(importer.includes("IMPORT_VERSION = '0.8.0'"), 'document import version must be 0.8.0');
check(browser.includes("version: '0.8.0'"), 'browser OCR version must be 0.8.0');
check(browser.includes("engine: 'tesseract-english-fast'"), 'browser OCR must use the self-hosted English engine');
check(!browser.includes('cdn.jsdelivr.net') && !browser.includes('@paddleocr/paddleocr-js'), 'browser OCR must not load its engine from a remote CDN');
check(localOcr.includes("WritingAssistant/0.8.0"), 'advanced OCR client version must be 0.8.0');
check(pkg.version === '0.8.0', 'package version must be 0.8.0');
check(!index.includes('M4-R1'), 'stage suffix must not appear in the public badge');
check(!browser.includes('browserOcrMock') && !browser.includes('mockMode'), 'production query mock must be removed');
check(!importer.includes('cdn.jsdelivr.net/npm/jszip') && !importer.includes('cdn.jsdelivr.net/npm/mammoth') && !importer.includes('workerRemote') && !importer.includes('LIBRARIES.pdf.remote'), 'document parsers must be local-only');
check(importer.includes('vendor/jszip/jszip.min.js'), 'local JSZip path');
check(importer.includes('vendor/mammoth/mammoth.browser.min.js'), 'local Mammoth path');
check(importer.includes('vendor/pdfjs/pdf.min.mjs'), 'local PDF.js path');
check(wrangler.includes('"directory": "./dist/site"'), 'Wrangler static assets directory');
check(headers.includes('Permissions-Policy:'), 'static asset permissions policy');
check(headers.includes('loopback-network=(self)'), 'loopback permission header');
check(headers.includes('/vendor/*'), 'long-lived vendor cache rule');

if (!sourceOnly) {
  const vendorChecks = [
    ['vendor/jszip/jszip.min.js', 50000],
    ['vendor/mammoth/mammoth.browser.min.js', 300000],
    ['vendor/pdfjs/pdf.min.mjs', 250000],
    ['vendor/pdfjs/pdf.worker.min.mjs', 700000],
    ['vendor/manifest.json', 50]
  ];
  for (const [path, minimum] of vendorChecks) {
    check(await exists(path, minimum), `missing or incomplete production vendor asset: ${path}`);
  }
}

if (checkDist) {
  const distChecks = [
    ['dist/site/index.html', 1000],
    ['dist/site/_headers', 100],
    ['dist/site/js/browser-ocr.js', 1000],
    ['dist/site/vendor/jszip/jszip.min.js', 50000],
    ['dist/site/vendor/mammoth/mammoth.browser.min.js', 300000],
    ['dist/site/vendor/pdfjs/pdf.min.mjs', 250000],
    ['dist/site/vendor/pdfjs/pdf.worker.min.mjs', 700000],
    ['dist/site/vendor/tesseract/tesseract.esm.min.js', 50000],
    ['dist/site/vendor/tesseract/worker.min.js', 50000],
    ['dist/site/vendor/tesseract/lang/eng.traineddata.gz', 500000]
  ];
  for (const [path, minimum] of distChecks) {
    check(await exists(path, minimum), `release build missing: ${path}`);
  }
}

if (failures.length) {
  console.error('0.8.0 release checks failed:');
  failures.forEach((failure) => console.error(' - ' + failure));
  process.exit(1);
}
console.log(`0.8.0 release checks passed${sourceOnly ? ' (source-only)' : checkDist ? ' (including dist/site)' : ''}.`);
