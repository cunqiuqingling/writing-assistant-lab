import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  app: await readFile(resolve(root, 'js/app.js'), 'utf8'),
  workspace: await readFile(resolve(root, 'js/library-workspace.js'), 'utf8'),
  importer: await readFile(resolve(root, 'js/document-import.js'), 'utf8'),
  index: await readFile(resolve(root, 'index.html'), 'utf8')
};

const checks = [
  ['M2 application version', files.app.includes("APP_VERSION = '0.8.0-m2'")],
  ['M2 visible badge', files.index.includes('0.8.0 M2')],
  ['card title edit control', files.workspace.includes('data-workspace-title=')],
  ['built-in title override state', files.workspace.includes('titleOverrides')],
  ['post-import document editor', files.workspace.includes('data-workspace-edit-document=') && files.importer.includes('openExistingItem')],
  ['full chapter editor', files.importer.includes('chapterEditorModal')],
  ['chapter split and merge', files.importer.includes('splitChapterAtCursor') && files.importer.includes('mergeChapter')],
  ['targeted progress reconciliation', files.importer.includes('reconcileProgress') && files.importer.includes('affectedRecords')],
  ['PDF two-column signal', files.importer.includes('twoColumnPages')],
  ['preview unit estimates', files.importer.includes('sentenceBatches') && files.importer.includes('paragraphBatches')]
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
if (failed.length) process.exitCode = 1;
