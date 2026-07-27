import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const files = [
  ['node_modules/jszip/dist/jszip.min.js', 'vendor/jszip/jszip.min.js'],
  ['node_modules/mammoth/mammoth.browser.min.js', 'vendor/mammoth/mammoth.browser.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'vendor/pdfjs/pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs'],
  ['node_modules/jszip/LICENSE.markdown', 'vendor/licenses/JSZip-LICENSE.markdown'],
  ['node_modules/mammoth/LICENSE', 'vendor/licenses/Mammoth-LICENSE.txt'],
  ['node_modules/pdfjs-dist/LICENSE', 'vendor/licenses/PDFjs-LICENSE.txt']
];

for (const [sourceRelative, targetRelative] of files) {
  const source = resolve(root, sourceRelative);
  const target = resolve(root, targetRelative);
  try {
    await access(source);
  } catch {
    throw new Error(`Missing ${sourceRelative}. Run npm install first.`);
  }
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  packages: {
    jszip: '3.10.1',
    mammoth: '1.12.0',
    'pdfjs-dist': '6.1.200'
  }
};
await mkdir(resolve(root, 'vendor'), { recursive: true });
await writeFile(resolve(root, 'vendor/manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('Prepared local parser libraries in vendor/.');
