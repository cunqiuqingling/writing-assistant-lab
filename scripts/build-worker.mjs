import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const routes = [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/index.html', 'index.html', 'text/html; charset=utf-8'],
  ['/assets/styles.css', 'assets/styles.css', 'text/css; charset=utf-8'],
  ['/assets/icon.svg', 'assets/icon.svg', 'image/svg+xml; charset=utf-8'],
  ['/favicon.ico', 'assets/icon.svg', 'image/svg+xml; charset=utf-8'],
  ['/data/starter-library.js', 'data/starter-library.js', 'text/javascript; charset=utf-8'],
  ['/data/starter-library.json', 'data/starter-library.json', 'application/json; charset=utf-8'],
  ['/data/library-import-template.json', 'data/library-import-template.json', 'application/json; charset=utf-8'],
  ['/js/app.js', 'js/app.js', 'text/javascript; charset=utf-8'],
  ['/js/library-workspace.js', 'js/library-workspace.js', 'text/javascript; charset=utf-8'],
  ['/js/ai-addon.js', 'js/ai-addon.js', 'text/javascript; charset=utf-8']
];

function readableString(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return '[\n' + lines.map((line) => '      ' + JSON.stringify(line)).join(',\n') + '\n    ].join("\\n")';
}

const entries = [];
for (const [route, relativePath, type] of routes) {
  const body = await readFile(resolve(projectRoot, relativePath), 'utf8');
  entries.push(`  ${JSON.stringify(route)}: {\n    type: ${JSON.stringify(type)},\n    body: ${readableString(body)}\n  }`);
}

const worker = `// Writing Assistant 0.7.0\n// Generated from source files. Do not edit this build by hand.\n\nconst FILES = {\n${entries.join(',\n')}\n};\n\nexport default {\n  async fetch(request) {\n    const url = new URL(request.url);\n    const file = FILES[url.pathname];\n    if (!file) {\n      return new Response('Not found', {\n        status: 404,\n        headers: { 'content-type': 'text/plain; charset=utf-8' }\n      });\n    }\n    const isDocument = url.pathname === '/' || url.pathname === '/index.html';\n    return new Response(file.body, {\n      headers: {\n        'content-type': file.type,\n        'cache-control': isDocument ? 'no-cache' : 'public, max-age=3600',\n        'x-content-type-options': 'nosniff',\n        'referrer-policy': 'strict-origin-when-cross-origin',\n        'permissions-policy': 'camera=(), microphone=(), geolocation=()'\n      }\n    });\n  }\n};\n`;

const dist = resolve(projectRoot, 'dist');
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, 'writing-assistant-worker.js'), worker, 'utf8');
await writeFile(resolve(dist, 'writing-assistant-worker.txt'), worker, 'utf8');
console.log(`Built Writing Assistant 0.7.0 Worker (${worker.length.toLocaleString()} characters).`);
