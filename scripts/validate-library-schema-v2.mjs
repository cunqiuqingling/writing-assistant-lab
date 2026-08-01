#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const repoIndex = args.indexOf('--repo');
const repo = path.resolve(repoIndex >= 0 ? args[repoIndex + 1] : process.cwd());
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const hash = (rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, rel))).digest('hex');

const ielts = json('data/ielts-reference-library.json');
const fda = json('data/fda-snapshot-library.json');
const sources = json('data/fda-snapshot-sources.json');
const template = json('data/library-import-template.json');
const index = read('index.html');
const schemaScript = read('js/library-schema-v2.js');

assert(ielts.schemaVersion === 2 && ielts.format === 'writing-assistant-library', 'IELTS library schema is invalid');
assert(Array.isArray(ielts.items) && ielts.items.length === 50, `Expected 50 IELTS reference samples, got ${ielts.items?.length}`);
assert(new Set(ielts.items.map(item => item.id)).size === 50, 'IELTS IDs must be unique');
for (const item of ielts.items) {
  assert(item.category === 'IELTS', `IELTS category mismatch: ${item.id}`);
  assert(item.materialType === 'ielts-ai-reference-sample', `IELTS material type mismatch: ${item.id}`);
  assert(typeof item.taskPrompt === 'string' && item.taskPrompt.length >= 60, `IELTS prompt is too short: ${item.id}`);
  assert(typeof item.text === 'string' && item.text.length >= 1200, `IELTS sample is too short: ${item.id}`);
  assert((item.text.match(/\b[\w'-]+\b/g) || []).length >= 250, `IELTS Task 2 sample is below 250 words: ${item.id}`);
  assert(item.assessment?.status === 'aiEstimated', `IELTS score identity must be aiEstimated: ${item.id}`);
  assert(item.assessment?.overallBand >= 0 && item.assessment?.overallBand <= 9, `IELTS band is invalid: ${item.id}`);
  assert(/not an IELTS examiner score/i.test(item.assessment?.sourceLabel || ''), `IELTS source identity is unclear: ${item.id}`);
  assert(typeof item.assessment?.examinerComments === 'string' && item.assessment.examinerComments.length >= 80, `IELTS feedback is missing: ${item.id}`);
  assert(!/official examiner score/i.test(item.source || ''), `IELTS source may imply official status: ${item.id}`);
}

assert(Array.isArray(sources) && sources.length === 50, `Expected 50 FDA source records, got ${sources?.length}`);
assert(new Set(sources.map(item => item.slug)).size === 50, 'FDA source slugs must be unique');
for (const source of sources) {
  assert(source.url.startsWith('https://www.fda.gov/drugs/'), `FDA URL is not allow-listed: ${source.url}`);
  assert(source.brandName && source.genericName && source.indication && source.approvalDate, `FDA source metadata incomplete: ${source.slug}`);
}
assert(fda.schemaVersion === 2 && fda.format === 'writing-assistant-library', 'FDA library schema is invalid');
assert(Array.isArray(fda.items) && fda.items.length === 50, `Expected 50 FDA articles, got ${fda.items?.length}`);
assert(new Set(fda.items.map(item => item.id)).size === 50, 'FDA item IDs must be unique');
for (const item of fda.items) {
  assert(item.category === 'Pharmacy', `FDA category mismatch: ${item.id}`);
  assert(item.materialType === 'fda-drug-trials-snapshot', `FDA material type mismatch: ${item.id}`);
  assert(item.sourceMeta?.publisher === 'U.S. Food and Drug Administration', `FDA publisher mismatch: ${item.id}`);
  assert(item.sourceMeta?.url?.startsWith('https://www.fda.gov/'), `FDA source URL invalid: ${item.id}`);
  assert(item.professionalMeta?.brandName && item.professionalMeta?.genericName, `FDA professional metadata missing: ${item.id}`);
  assert(typeof item.text === 'string' && item.text.length >= 5000, `FDA article text is too short: ${item.id}`);
  assert(Array.isArray(item.chapters) && item.chapters.length >= 5, `FDA chapters are incomplete: ${item.id}`);
  assert(!/Wikipedia/i.test(item.source || ''), `FDA item unexpectedly uses Wikipedia: ${item.id}`);
}

assert(template.schemaVersion === 2 && template.format === 'writing-assistant-library', 'Import template is not Schema v2');
assert(index.includes('data/ielts-reference-library.js'), 'IELTS data script is not loaded');
assert(index.includes('data/fda-snapshot-library.js'), 'FDA data script is not loaded');
assert(index.includes('js/library-schema-v2.js'), 'Schema v2 feature script is not loaded');
assert(index.includes('assets/library-schema-v2.css'), 'Schema v2 stylesheet is not loaded');
assert(schemaScript.includes('让AI制作练习库'), 'AI library wizard is missing');
assert(schemaScript.includes('IMPORT PREFLIGHT'), 'Import preflight is missing');
assert(schemaScript.includes("category: 'Pharmacy'"), 'Pharmacy Schema v2 example is missing');

const onlineCatalogHash = hash('data/online-resource-catalog.js');
assert(onlineCatalogHash === 'fc6d20c82adb7c76d3ba4c72b2e92379a1c428e1c1bf4de00d998638b80b9a4c', 'Existing online resource catalog was unexpectedly changed');

const report = {
  ok: true,
  schemaVersion: 2,
  ieltsNewReferenceSamples: ielts.items.length,
  ieltsEffectiveBuiltinsMinimum: ielts.items.length + 2,
  ieltsAssessmentIdentity: 'aiEstimated only',
  fdaSnapshotArticles: fda.items.length,
  pharmacyEffectiveBuiltinsMinimum: fda.items.length + 1,
  fdaSourceUrls: sources.length,
  importSchema: 'writing-assistant-library v2',
  aiPromptWizard: true,
  importPreflight: true,
  existingOnlineResourceCatalogPreserved: true,
  totalIELTSTextCharacters: ielts.items.reduce((sum, item) => sum + item.text.length, 0),
  totalFDATextCharacters: fda.items.reduce((sum, item) => sum + item.text.length, 0)
};
console.log(JSON.stringify(report));
