const SDK_URLS = [
  'https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm',
  'https://fastly.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm'
];
let configured = { mock: false, language: 'ch', ocrVersion: 'PP-OCRv5' };
let engine = null;

function send(message) { self.postMessage(message); }
function clean(value) { return String(value == null ? '' : value).replace(/\u0000/g, '').trim(); }
function gather(value, depth = 0, output = []) {
  if (depth > 7 || value == null) return output;
  if (typeof value === 'string') { if (clean(value)) output.push(clean(value)); return output; }
  if (Array.isArray(value)) { value.forEach((entry) => gather(entry, depth + 1, output)); return output; }
  if (typeof value === 'object') {
    for (const key of ['text', 'rec_text', 'recText', 'content', 'label', 'value']) if (key in value) gather(value[key], depth + 1, output);
    if (!output.length) Object.values(value).forEach((entry) => gather(entry, depth + 1, output));
  }
  return output;
}
function normalize(result) {
  const lines = gather(result).filter((line, index, all) => line && all.indexOf(line) === index);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function loadSdk() {
  if (engine) return engine;
  send({ type: 'model-progress', title: '正在加载浏览器OCR', detail: '首次使用需要下载SDK和轻量模型，之后由浏览器缓存。' });
  let module = null;
  let lastError = null;
  for (const url of SDK_URLS) {
    try { module = await import(url); break; }
    catch (error) { lastError = error; }
  }
  if (!module) throw lastError || new Error('无法加载PaddleOCR.js');
  const PaddleOCR = module.PaddleOCR || module.default?.PaddleOCR || module.default;
  if (!PaddleOCR || typeof PaddleOCR.create !== 'function') throw new Error('PaddleOCR.js接口不可用');
  engine = await PaddleOCR.create({
    lang: configured.language || 'ch',
    ocrVersion: configured.ocrVersion || 'PP-OCRv5',
    worker: false,
    ortOptions: {
      backend: 'wasm',
      wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/',
      numThreads: Math.max(1, Math.min(2, Number(self.navigator && self.navigator.hardwareConcurrency) || 1)),
      simd: true
    }
  });
  send({ type: 'model-progress', title: '浏览器OCR已就绪', detail: '正在处理选定页面。' });
  return engine;
}
async function recognize(blob, pageNumber) {
  if (configured.mock) return { text: `Browser OCR mock result for page ${pageNumber}. This confirms the local browser pipeline without downloading a model.`, engine: 'PP-OCRv5 Browser Mock' };
  const active = await loadSdk();
  let result;
  if (typeof active.ocr === 'function') result = await active.ocr(blob);
  else if (typeof active.predict === 'function') result = await active.predict(blob);
  else if (typeof active.recognize === 'function') result = await active.recognize(blob);
  else throw new Error('PaddleOCR.js未提供可识别的方法');
  const text = normalize(result);
  if (!text) throw new Error('当前页面没有识别出文字');
  return { text, engine: 'PP-OCRv5 Mobile · Browser WASM' };
}
self.addEventListener('message', async (event) => {
  const data = event.data || {};
  const requestId = data.requestId || '';
  try {
    if (data.type === 'configure') {
      configured = Object.assign({}, configured, { mock: Boolean(data.mock), language: data.language || 'ch', ocrVersion: data.ocrVersion || 'PP-OCRv5' });
      send({ type: 'configured', requestId, mock: configured.mock });
      return;
    }
    if (data.type === 'recognize') {
      if (!(data.blob instanceof Blob)) throw new Error('OCR页面图像无效');
      const result = await recognize(data.blob, Number(data.pageNumber) || 1);
      send({ type: 'result', requestId, pageNumber: Number(data.pageNumber) || 1, text: result.text, engine: result.engine });
      return;
    }
    if (data.type === 'dispose') {
      if (engine && typeof engine.dispose === 'function') await engine.dispose();
      engine = null;
      send({ type: 'disposed', requestId });
      close();
      return;
    }
    throw new Error('未知的浏览器OCR任务');
  } catch (error) {
    send({ type: 'error', requestId, error: clean(error && error.message) || '浏览器OCR失败' });
  }
});
send({ type: 'ready' });
