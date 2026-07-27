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
const privacy = await text('PRIVACY.md');
const terms = await text('TERMS.md');
const copyright = await text('COPYRIGHT_AND_TAKEDOWN.md');
const contact = await text('CONTACT.md');

check(index.includes('<span class="version-badge">0.8.1</span>'), 'public version badge must be 0.8.1');
check(index.includes('class="app-footer"'), 'main application must expose the policy footer');
check(index.includes('legal/privacy.html'), 'main application must link to the privacy page');
check(app.includes("APP_VERSION = '0.8.1'"), 'app version must be 0.8.1');
check(importer.includes("IMPORT_VERSION = '0.8.1'"), 'document import version must be 0.8.1');
check(browser.includes("version: '0.8.1'"), 'browser OCR client version must be 0.8.1');
check(browser.includes("engine: 'tesseract-english-fast'"), 'browser OCR must use the self-hosted English engine');
check(!browser.includes('cdn.jsdelivr.net') && !browser.includes('@paddleocr/paddleocr-js'), 'browser OCR must not load its engine from a remote CDN');
check(localOcr.includes("WritingAssistant/0.8.1"), 'advanced OCR client version must be 0.8.1');
check(pkg.version === '0.8.1', 'package version must be 0.8.1');
check(!browser.includes('browserOcrMock') && !browser.includes('mockMode'), 'production query mock must be removed');
check(!importer.includes('cdn.jsdelivr.net/npm/jszip') && !importer.includes('cdn.jsdelivr.net/npm/mammoth') && !importer.includes('workerRemote') && !importer.includes('LIBRARIES.pdf.remote'), 'document parsers must be local-only');
check(importer.includes('vendor/jszip/jszip.min.js'), 'local JSZip path');
check(importer.includes('vendor/mammoth/mammoth.browser.min.js'), 'local Mammoth path');
check(importer.includes('vendor/pdfjs/pdf.min.mjs'), 'local PDF.js path');
check(wrangler.includes('"directory": "./dist/site"'), 'Wrangler static assets directory');
check(headers.includes('Permissions-Policy:'), 'static asset permissions policy');
check(headers.includes('loopback-network=(self)'), 'loopback permission header');
check(headers.includes('/vendor/*'), 'long-lived vendor cache rule');
check(headers.includes('/legal/*'), 'legal-page cache rule');
check(!privacy.includes('or AI API call'), 'outdated no-AI-request statement must be removed');
check(privacy.includes('Cloudflare'), 'privacy policy must disclose infrastructure metadata');
check(privacy.includes('BYOK'), 'privacy policy must disclose BYOK data flow');
check(terms.includes('Terms of Use and Disclaimer'), 'terms document must exist');
check(copyright.toLowerCase().includes('rights notice'), 'copyright notice process must exist');
check(contact.includes('Private Vulnerability Reporting'), 'private contact route must be documented');

const legalFiles = [
  'legal/index.html',
  'legal/privacy.html',
  'legal/terms.html',
  'legal/copyright.html',
  'legal/security.html',
  'legal/third-party.html',
  'legal/contact.html',
  'legal/legal.css'
];
for (const path of legalFiles) {
  check(await exists(path, 1000), `missing public legal file: ${path}`);
}

if (!sourceOnly) {
  const vendorChecks = [
    ['vendor/jszip/jszip.min.js', 50000],
    ['vendor/mammoth/mammoth.browser.min.js', 300000],
    ['vendor/pdfjs/pdf.min.mjs', 250000],
    ['vendor/pdfjs/pdf.worker.min.mjs', 700000],
    ['vendor/tesseract/tesseract.esm.min.js', 50000],
    ['vendor/tesseract/worker.min.js', 50000],
    ['vendor/tesseract/lang/eng.traineddata.gz', 500000],
    ['vendor/manifest.json', 2]
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
    ['dist/site/legal/index.html', 1000],
    ['dist/site/legal/privacy.html', 1000],
    ['dist/site/legal/terms.html', 1000],
    ['dist/site/legal/copyright.html', 1000],
    ['dist/site/legal/security.html', 1000],
    ['dist/site/legal/third-party.html', 1000],
    ['dist/site/legal/contact.html', 1000],
    ['dist/site/legal/legal.css', 1000],
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
  console.error('0.8.1 release checks failed:');
  failures.forEach((failure) => console.error(' - ' + failure));
  process.exit(1);
}
console.log(`0.8.1 release checks passed${sourceOnly ? ' (source-only)' : checkDist ? ' (including dist/site)' : ''}.`);
