import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const read = (path) => readFile(resolve(root, path), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const catalogSource = await read('data/online-resource-catalog.js');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(catalogSource, sandbox);
const catalog = sandbox.window.WRITING_ASSISTANT_ONLINE_RESOURCE_CATALOG;
assert(Array.isArray(catalog), 'Catalog must be an array');
assert(catalog.length === 40, `Expected 40 curated entries, got ${catalog.length}`);
const groups = ['IELTS Writing','Academic Writing','Pharmacy & Biomedicine','Literature'];
for (const group of groups) assert(catalog.filter((item) => item.group === group).length === 10, `${group} must contain 10 entries`);
assert(new Set(catalog.map((item) => item.id)).size === catalog.length, 'Catalog IDs must be unique');
assert(catalog.every((item) => ['wikipedia','wikisource'].includes(item.source)), 'Catalog source must be allowlisted');
assert(catalog.every((item) => item.folderId && item.query && item.title), 'Catalog entries need folder, query and title');

const app = await read('js/app.js');
const workspace = await read('js/library-workspace.js');
const online = await read('js/online-resources.js');
const importer = await read('js/document-import.js');
const index = await read('index.html');
const worker = await read('scripts/build-worker.mjs');

assert(app.includes("APP_VERSION = '0.8.0-m3'"), 'App version must be M3');
assert(app.includes('collapsedFolderIds'), 'App state must store collapsed folder IDs');
assert(workspace.includes('data-folder-toggle'), 'Folder tree needs independent toggle buttons');
assert(workspace.includes("folder.id === 'folder-all'"), 'All Materials root must participate in collapse rendering');
assert(workspace.includes('aria-expanded'), 'Folder toggles need accessible expanded state');
assert(importer.includes('openPrepared: openPreparedDocument'), 'Online pages must use the document preview pipeline');
assert(online.includes("https://en.wikipedia.org/w/api.php"), 'Wikipedia endpoint must be fixed');
assert(online.includes("https://en.wikisource.org/w/api.php"), 'Wikisource endpoint must be fixed');
assert(online.includes("url.searchParams.set('origin', '*')"), 'Cross-origin API calls must explicitly use origin=*');
assert(online.includes("credentials: 'omit'"), 'Remote requests must not send credentials');
assert(online.includes('DOMParser'), 'Remote HTML must be parsed into text');
assert(!online.includes('eval('), 'Remote resource code must not use eval');
assert(index.includes('data/online-resource-catalog.js'), 'Catalog script missing from index');
assert(index.includes('js/online-resources.js'), 'Online resource script missing from index');
assert(worker.includes('/js/online-resources.js') && worker.includes('/data/online-resource-catalog.js'), 'Legacy Worker routes missing M3 files');

console.log('M3 static checks passed: 40 curated resources, collapsible tree, allowlisted CORS fetch, and shared import preview.');
