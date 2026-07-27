import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const failures = [];
function check(condition, message) { if (!condition) failures.push(message); }

const [index, app, importer, localOcr, workerBuild, server, installer, packageJson, privacy, security] = await Promise.all([
  read('index.html'), read('js/app.js'), read('js/document-import.js'), read('js/local-ocr.js'),
  read('scripts/build-worker.mjs'), read('local-ocr-companion/server.py'),
  read('local-ocr-companion/install_macos_apple_silicon.command'), read('package.json'),
  read('PRIVACY.md'), read('SECURITY.md')
]);

check(index.includes('0.8.0 M4'), 'index badge must display 0.8.0 M4');
check(index.includes('js/local-ocr.js'), 'index must load js/local-ocr.js');
check(app.includes("APP_VERSION = '0.8.0-m4'"), 'app version must be 0.8.0-m4');
check(localOcr.includes("SERVICE_URL = 'http://127.0.0.1:8765'"), 'web client must use fixed loopback service URL');
check(localOcr.includes("targetAddressSpace: 'loopback'"), 'web client must annotate loopback requests');
check(localOcr.includes('writing-assistant-local-ocr-token-v1'), 'web client must keep a separate local pairing token');
check(!localOcr.includes('api.openai.com') && !localOcr.includes('api.siliconflow'), 'OCR client must not contain cloud OCR endpoints');
check(importer.includes('getOcrContext: getOcrContext'), 'document importer must expose OCR context');
check(importer.includes('renderPdfPageForOcr: renderPdfPageForOcr'), 'document importer must expose page rendering');
check(importer.includes('applyLocalOcrResults: applyLocalOcrResults'), 'document importer must accept local OCR results');
check(importer.includes('lowTextPageNumbers'), 'PDF diagnostics must identify low-text pages');
check(!importer.includes("throw new Error('该PDF没有可提取的文字层')"), 'scan-like PDFs must remain available for local OCR');
check(server.includes('HOST = "127.0.0.1"'), 'companion must bind to loopback only');
check(server.includes('PAIRING_TOKEN = ensure_token()'), 'companion must require a persistent random pairing token');
check(server.includes('MAX_REQUEST_BYTES'), 'companion must enforce request limits');
check(server.includes('https://writing-assistant.ccwu.cc'), 'companion must explicitly allow the production origin');
check(server.includes('Access-Control-Allow-Origin'), 'companion must implement origin-scoped CORS');
check(server.includes('hmac.compare_digest'), 'companion must compare bearer tokens safely');
check(installer.includes('paddlepaddle==3.2.1'), 'Apple Silicon installer must pin PaddlePaddle');
check(installer.includes('paddleocr[doc-parser]==3.7.0'), 'Apple Silicon installer must pin PaddleOCR with doc-parser extras');
check(workerBuild.includes("'/js/local-ocr.js'"), 'legacy worker must include local OCR web module');
check(workerBuild.includes('loopback-network=(self)'), 'deployment headers must allow top-level loopback requests');
check(packageJson.includes('"check:m4"'), 'package.json must expose check:m4');
check(privacy.includes('Local OCR companion'), 'privacy notice must document the local OCR boundary');
check(security.includes('Loopback OCR companion'), 'security policy must document the loopback service');

for (const required of [
  'docs/LOCAL_OCR.md',
  'local-ocr-companion/README.zh-CN.md',
  'local-ocr-companion/COMPANION_PROTOCOL.md',
  'test-fixtures/sample-scanned-image-only.pdf',
  'test-fixtures/M4_TEST_PLAN.md'
]) {
  try { await stat(resolve(root, required)); }
  catch { failures.push(`missing required M4 file: ${required}`); }
}

if (failures.length) {
  console.error('M4 checks failed:');
  failures.forEach((failure) => console.error(' - ' + failure));
  process.exit(1);
}
console.log('M4 static checks passed: loopback boundary, pairing, PDF handoff, installer pins, docs and fixtures.');
