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
const styles = await text('assets/styles.css');
const app = await text('js/app.js');
const importer = await text('js/document-import.js');
const browser = await text('js/browser-ocr.js');
const localOcr = await text('js/local-ocr.js');
const workspace = await text('js/library-workspace.js');
const aiAddon = await text('js/ai-addon.js');
const pkg = JSON.parse(await text('package.json'));
const wrangler = await text('wrangler.jsonc');
const headers = await text('_headers');
const privacy = await text('PRIVACY.md');
const terms = await text('TERMS.md');
const copyright = await text('COPYRIGHT_AND_TAKEDOWN.md');
const contact = await text('CONTACT.md');
const aiProviderGuide = await text('docs/AI_PROVIDER_SETUP.md');

check(index.includes('<span class="version-badge">0.8.2-R1</span>'), 'public version badge must be 0.8.2-R1');
check(index.includes('class="app-footer"'), 'main application must expose the policy footer');
check(index.includes('legal/privacy.html'), 'main application must link to the privacy page');
check(index.includes('about/philosophy.html'), 'main application must link to the writing philosophy');
check(index.includes('Language is information, and information is everything.'), 'main footer must show the permanent philosophy line');
check(index.includes('external-ai-help'), 'practice views must explain how copied feedback material is used');
check(index.includes('复制本单元 · AI反馈'), 'sentence copy action must identify its external-AI purpose');
check(index.includes('复制当前训练 · AI反馈'), 'paragraph copy action must identify its external-AI purpose');
check(styles.includes('0.8.2-R1 · external AI feedback help'), 'external-AI help styling must exist');
check(styles.includes('0.8.2-R1 · iPad/tablet sticky-panel containment'), 'tablet layout must prevent the sticky left panel from covering the full-width coach panel');
check(app.includes("APP_VERSION = '0.8.2-r1'"), 'app version must be 0.8.2-r1');
check(app.includes('请用简体中文反馈'), 'external-AI copy payload must request Chinese feedback');
check(app.includes('可粘贴到外部AI平台'), 'copy success messages must explain the next step');
check(importer.includes("IMPORT_VERSION = '0.8.2-r1'"), 'document import version must be 0.8.2-r1');
check(browser.includes("version: '0.8.2-r1'"), 'browser OCR client version must be 0.8.2-r1');
check(browser.includes("engine: 'tesseract-english-fast'"), 'browser OCR must use the self-hosted English engine');
check(!browser.includes('cdn.jsdelivr.net') && !browser.includes('@paddleocr/paddleocr-js'), 'browser OCR must not load its engine from a remote CDN');
check(localOcr.includes("WritingAssistant/0.8.2-r1"), 'advanced OCR client version must be 0.8.2-r1');
check(pkg.version === '0.8.2-r1', 'package version must be 0.8.2-r1');
check(workspace.includes('data-workspace-manage'), 'library cards must expose a management entry');
check(workspace.includes('deleteLibraryItem'), 'library deletion must use the coordinated deletion path');
check(workspace.includes('clearLabsUsingDocument'), 'deleting an active material must clear affected labs');
check(aiAddon.includes("PROFILE_KEY = 'writing-assistant-ai-profiles-v2'"), 'AI profiles must use provider-specific configuration storage');
check(aiAddon.includes("SESSION_KEYS_KEY = 'writing-assistant-ai-session-keys-v2'"), 'session keys must be separated by provider');
check(aiAddon.includes("ENCRYPTED_KEYS_KEY = 'writing-assistant-ai-encrypted-keys-v2'"), 'encrypted keys must be separated by provider');
check(aiAddon.includes("zhipu: {"), 'Zhipu GLM must have a first-party preset');
check(aiAddon.includes("model: 'glm-4-flash-250414'"), 'Zhipu preset must default to glm-4-flash-250414');
check(aiAddon.includes("model: 'gemini-3.1-flash-lite'"), 'Gemini preset must default to gemini-3.1-flash-lite');
check(aiAddon.includes('模型名称 <span class="ai-model-label-note">（可自行选择）</span>'), 'model field must state that the model is user-selectable');
check(aiAddon.includes('AI设置与调用说明'), 'AI settings must include setup and invocation instructions');
check(aiAddon.includes('aiProviderDocsLink'), 'AI settings must link to provider API documentation');
check(aiAddon.includes("endpoint: '/chat/completions'"), 'Zhipu GLM endpoint must omit the extra /v1 segment');
check(aiAddon.includes('zhipuThinkingConfigSupported'), 'Zhipu Thinking compatibility must be model-aware');
check(aiAddon.includes("next.provider === 'zhipu' && zhipuThinkingConfigSupported(next.model)"), 'Thinking must only be disabled for supported Zhipu model families');
check(!aiAddon.includes("next.provider === 'deepseek' || next.provider === 'zhipu'"), 'non-Thinking Zhipu models must not receive a blanket Thinking parameter');
check(aiAddon.includes('renderAnalysisMarkdown'), 'AI output must use the restricted Markdown renderer');
check(aiAddon.includes("document.createTextNode"), 'AI result renderer must construct escaped DOM nodes');
check(!aiAddon.includes('<pre class="ai-result"'), 'AI output must not be rendered as a raw preformatted block');
check(aiAddon.includes('输出语言必须以简体中文为主'), 'Chinese-first analysis rules must be enforced');
check(aiAddon.includes('没有“to + 动词原形”等不定式结构时'), 'grammar self-check rules must prevent false infinitive labels');
check(aiAddon.includes('PROMPT_VERSION'), 'AI cache identity must include a prompt version');
check(aiAddon.includes('移除当前服务商API Key'), 'credential removal must be scoped to the current provider');
check(aiAddon.includes('清除全部AI配置与密钥'), 'full AI configuration clearing must remain available');
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
check(aiProviderGuide.includes('glm-4-flash-250414'), 'provider guide must document the Zhipu default model');
check(aiProviderGuide.includes('gemini-3.1-flash-lite'), 'provider guide must document the Gemini default model');
check(aiProviderGuide.includes('如何配置和调用'), 'provider guide must explain setup and invocation');
check((await text('README.zh-CN.md')).includes('文字是自由的，我们要学会如何排列它们，让自己的宇宙和这个世界产生连接。'), 'required Chinese philosophy sentence must be preserved');

const legalFiles = [
  'legal/index.html',
  'legal/privacy.html',
  'legal/terms.html',
  'legal/copyright.html',
  'legal/security.html',
  'legal/third-party.html',
  'legal/contact.html',
  'legal/legal.css',
  'about/philosophy.html',
  'about/philosophy.css'
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
    ['dist/site/about/philosophy.html', 1000],
    ['dist/site/about/philosophy.css', 1000],
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
  console.error('0.8.2-R1 release checks failed:');
  failures.forEach((failure) => console.error(' - ' + failure));
  process.exit(1);
}
console.log(`0.8.2-R1 release checks passed${sourceOnly ? ' (source-only)' : checkDist ? ' (including dist/site)' : ''}.`);
