import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(resolve(root, p), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const [index, app, importer, browser, worker, advanced, builder, installer, docs] = await Promise.all([
  read('index.html'), read('js/app.js'), read('js/document-import.js'), read('js/browser-ocr.js'),
  read('js/browser-ocr-worker.mjs'), read('js/local-ocr.js'), read('scripts/build-worker.mjs'),
  read('local-ocr-companion/install_macos_apple_silicon.command'), read('docs/BROWSER_OCR.md')
]);
check(index.includes('0.8.0 M4-R1'), 'version badge');
check(index.includes('js/browser-ocr.js'), 'browser OCR controller loaded');
check(app.includes("APP_VERSION = '0.8.0-m4-r1'"), 'app version');
check(browser.includes("window.WritingAssistantLocalOCR"), 'browser controller owns importer hook');
check(browser.includes("new Worker('js/browser-ocr-worker.mjs'"), 'module worker');
check(browser.includes('navigator.deviceMemory') && browser.includes('navigator.hardwareConcurrency'), 'device protection');
check(browser.includes('browserOcrMock'), 'mock acceptance mode');
check(worker.includes('@paddleocr/paddleocr-js@0.4.2'), 'pinned official browser SDK');
check(worker.includes("ocrVersion: configured.ocrVersion"), 'PP-OCRv5 config');
check(!browser.includes('api.openai.com') && !worker.includes('api.openai.com'), 'no cloud OCR API');
check(importer.includes('applyOcrResults: applyOcrResults'), 'generic OCR handoff');
check(importer.includes("profile === 'browser'"), 'lower browser render profile');
check(advanced.includes('window.WritingAssistantAdvancedOCR'), 'advanced connector separated');
check(advanced.includes('安装前请确认'), 'advanced install warning');
check(installer.includes('local exit_code=$?'), 'zsh readonly status bug fixed');
check(!installer.includes('status=$?'), 'no zsh readonly status assignment');
check(installer.includes('10 <= sys.version_info.minor <= 12'), 'Python 3.13 rejected');
check(installer.includes('PADDLE_PDX_MODEL_SOURCE'), 'model source stored');
check(builder.includes("'/js/browser-ocr-worker.mjs'"), 'legacy worker includes OCR worker module');
check(docs.includes('不恢复表格、公式'), 'text-only product scope');
for (const path of ['docs/BROWSER_OCR.md','docs/LOCAL_OCR.md','local-ocr-companion/cleanup_incomplete_install.command','test-fixtures/sample-scanned-image-only.pdf']) {
  try { await stat(resolve(root, path)); } catch { failures.push('missing ' + path); }
}
if (failures.length) { console.error('M4-R1 checks failed:'); failures.forEach((x) => console.error(' - ' + x)); process.exit(1); }
console.log('M4-R1 static checks passed: browser-first OCR, device limits, advanced warning, installer repair and text-only scope.');
