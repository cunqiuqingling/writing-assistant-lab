import {
  access,
  copyFile,
  cp,
  mkdir,
  readdir,
  stat,
  writeFile
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const files = [
  ['node_modules/jszip/dist/jszip.min.js', 'vendor/jszip/jszip.min.js'],
  ['node_modules/mammoth/mammoth.browser.min.js', 'vendor/mammoth/mammoth.browser.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'vendor/pdfjs/pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs'],
  ['node_modules/tesseract.js/dist/tesseract.esm.min.js', 'vendor/tesseract/tesseract.esm.min.js'],
  ['node_modules/tesseract.js/dist/worker.min.js', 'vendor/tesseract/worker.min.js'],
  ['node_modules/jszip/LICENSE.markdown', 'vendor/licenses/JSZip-LICENSE.markdown'],
  ['node_modules/mammoth/LICENSE', 'vendor/licenses/Mammoth-LICENSE.txt'],
  ['node_modules/pdfjs-dist/LICENSE', 'vendor/licenses/PDFjs-LICENSE.txt'],
  ['node_modules/tesseract.js/LICENSE.md', 'vendor/licenses/TesseractJS-LICENSE.md']
];

async function requirePath(relative) {
  const path = resolve(root, relative);
  try { await access(path); }
  catch { throw new Error(`Missing ${relative}. Run npm install first.`); }
  return path;
}

for (const [sourceRelative, targetRelative] of files) {
  const source = await requirePath(sourceRelative);
  const target = resolve(root, targetRelative);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

const coreSource = await requirePath('node_modules/tesseract.js-core');
const coreTarget = resolve(root, 'vendor/tesseract/core');
await mkdir(dirname(coreTarget), { recursive: true });
await cp(coreSource, coreTarget, {
  recursive: true,
  filter(source) {
    const name = basename(source);
    return name !== 'node_modules' && name !== '.git';
  }
});

async function findFiles(folder, wantedName, output = []) {
  const entries = await readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(folder, entry.name);
    if (entry.isDirectory()) await findFiles(full, wantedName, output);
    else if (entry.isFile() && entry.name === wantedName) output.push(full);
  }
  return output;
}

const languageRoot = await requirePath('node_modules/@tesseract.js-data/eng');
const candidates = await findFiles(languageRoot, 'eng.traineddata.gz');
if (!candidates.length) {
  throw new Error('The English Tesseract data package did not contain eng.traineddata.gz.');
}

const candidateSizes = await Promise.all(
  candidates.map(async (path) => ({ path, bytes: (await stat(path)).size }))
);
candidateSizes.sort((a, b) => a.bytes - b.bytes);
const selectedLanguage = candidateSizes[0];

const languageTarget = resolve(root, 'vendor/tesseract/lang/eng.traineddata.gz');
await mkdir(dirname(languageTarget), { recursive: true });
await copyFile(selectedLanguage.path, languageTarget);

const manifest = {
  generatedAt: new Date().toISOString(),
  packages: {
    jszip: '3.10.1',
    mammoth: '1.12.0',
    'pdfjs-dist': '6.1.200',
    'tesseract.js': '7.0.0',
    '@tesseract.js-data/eng': '1.0.0'
  },
  browserOcr: {
    engine: 'Tesseract.js',
    language: 'eng',
    trainedDataBytes: selectedLanguage.bytes,
    selectedPackagedFile: selectedLanguage.path.replace(root + '/', '')
  }
};

await mkdir(resolve(root, 'vendor'), { recursive: true });
await writeFile(
  resolve(root, 'vendor/manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  'utf8'
);

console.log(
  `Prepared local parser libraries and fast English OCR assets in vendor/ ` +
  `(${selectedLanguage.bytes.toLocaleString()} bytes traineddata).`
);
