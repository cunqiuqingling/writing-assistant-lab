import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/assets/styles.css': ['assets/styles.css', 'text/css; charset=utf-8'],
  '/assets/icon.svg': ['assets/icon.svg', 'image/svg+xml; charset=utf-8'],
  '/js/app.js': ['js/app.js', 'text/javascript; charset=utf-8'],
  '/js/ai-addon.js': ['js/ai-addon.js', 'text/javascript; charset=utf-8'],
  '/data/starter-library.js': ['data/starter-library.js', 'text/javascript; charset=utf-8'],
  '/data/starter-library.json': ['data/starter-library.json', 'application/json; charset=utf-8'],
  '/data/library-import-template.json': ['data/library-import-template.json', 'application/json; charset=utf-8']
};

const payload = Object.fromEntries(Object.entries(files).map(([url,[file,type]]) => [url,{body:read(file),type}]));
const output = `const FILES = ${JSON.stringify(payload)};\n\nexport default {\n  async fetch(request) {\n    const url = new URL(request.url);\n    const file = FILES[url.pathname] || FILES['/'];\n    return new Response(file.body, {\n      headers: {\n        'content-type': file.type,\n        'cache-control': url.pathname === '/' || url.pathname === '/index.html' ? 'no-cache' : 'public, max-age=3600',\n        'x-content-type-options': 'nosniff',\n        'referrer-policy': 'strict-origin-when-cross-origin'\n      }\n    });\n  }\n};\n`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'writing-assistant-worker.js'), output);
fs.writeFileSync(path.join(root, 'dist', 'writing-assistant-worker.txt'), output);
console.log('Built dist/writing-assistant-worker.js');
