import { Worker } from 'node:worker_threads';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerUrl = pathToFileURL(resolve(root, 'js/browser-ocr-worker.mjs')).href;
const wrapper = `
import { parentPort } from 'node:worker_threads';
globalThis.self = { addEventListener(type, listener) { if (type === 'message') parentPort.on('message', data => listener({ data })); }, postMessage(data) { parentPort.postMessage(data); } };
globalThis.close = () => process.exit(0);
await import(${JSON.stringify(workerUrl)});
`;
const dataUrl = new URL('data:text/javascript,' + encodeURIComponent(wrapper));
const worker = new Worker(dataUrl, { type: 'module' });
const waitFor = (predicate, timeout = 5000) => new Promise((resolvePromise, reject) => {
  const timer = setTimeout(() => reject(new Error('worker timeout')), timeout);
  const handler = (data) => { if (!predicate(data)) return; clearTimeout(timer); worker.off('message', handler); resolvePromise(data); };
  worker.on('message', handler);
});
await waitFor((data) => data.type === 'ready');
worker.postMessage({ type: 'configure', requestId: 'cfg', mock: true });
await waitFor((data) => data.requestId === 'cfg' && data.type === 'configured');
worker.postMessage({ type: 'recognize', requestId: 'run', pageNumber: 2, blob: new Blob(['test'], { type: 'image/jpeg' }) });
const result = await waitFor((data) => data.requestId === 'run');
if (result.type !== 'result' || !result.text.includes('page 2')) throw new Error('mock OCR result invalid');
await worker.terminate();
console.log('Browser OCR worker mock test passed.');
