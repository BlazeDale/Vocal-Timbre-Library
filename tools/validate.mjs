#!/usr/bin/env node
/*
 * Vocal Timbre Library — pre-commit validator.
 *   node tools/validate.mjs [data.js-override]
 * Loads LIB/RECENT/STUDY_META from data.js and checks the invariants we used
 * to verify by hand. Exit code 1 on any failure so it can gate a commit.
 * (An optional path arg overrides data.js — used only for self-testing.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadData, checkInSync } from './build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(ROOT, 'vocal_timbre_library.html');
const STUDIES_MD = join(ROOT, 'artist_studies.md');

const STYLE_CAP = 1000;
const LYRIC_CAP = 5000;
const MANDATED = ['Harmonic stagnation', 'Dynamic flattening', 'Quantized sterility', 'Structural monotony', 'Predictability'];
// Artist/band proper names that must never appear in prompt text (descriptor-only
// rule). Place names, eras and gear are fine — only real acts belong here.
const ARTIST_DENYLIST = [
  '5e233a782b86db91c4cc9c293fcf60f350fbb5a69985f67e5a36b37072024529', 'f4a55cd295bf19c35d5b0a18ef1585c4d05606b91a9825e0fb8122d991574c73', 'f971b78d290e6798b0de8c20e586c766744fc81bc0bcfbcc67a83f4792cf2ea4', '0191ccb24636e79e1df912a98781e3d45ed72b4004cb7e81eae359c6a4311be1', 'a2b08510e99099257f8c2570324a24cbd7977af0dc177ce20d52762f750d4133',
  '4f18715a1e9e414f51be4643895c8798d4eeefe9c19774ae644b3ea5682cbd6b', '2fb2f63bf833e02c77258276b94dea885922f31b773d512e5335e0aa4997dc05', 'c65aa6e1e21ba4f7302e8e9304196baa4fbe175cf9d09cc0114c25924ecba9ca', 'c12ea8107a1210574a31394fe05bebdb2cd1fb7f491939fd743d3f6f09aee721', '3f3371c759cd4d39b5d9ac571fdde1007568391d621b0f799fde70f0f245a6e1', '6ca202c88e549dff68c09bfafbfc60b2fac074debc1e6777e9ba4b6c703ed114',
  'e4cb3b7ff5a4b3885230474eeeef7d8ac009169af23faa0f7b373933cb664f46', 'b88adbff069627943b636dcfce256b4456dd8db6c7935e8986ead97e65bfbfeb', '5c70605f72ca41654d9ef732f3f00d0ac2dd5fec2a1b1975c43a43c6eef60de3', '1b9d92292d0df003e83b4e430cc78f2e36f37422eb33fa2014699b1d4d5d80ec',
];

const len = s => [...s].length;
const fails = [], passes = [];
const fail = m => fails.push(m);
const pass = m => passes.push(m);

/* ---------- load data ---------- */
let LIB, RECENT;
try {
  ({ LIB, RECENT } = loadData(process.argv[2]));
  pass(`loaded data.js (${LIB.length} entries)`);
} catch (e) {
  fail(`could not load data.js: ${e.message}`);
  report();
}
const html = readFileSync(HTML, 'utf8');
const numbered = LIB.filter(v => typeof v.n === 'number');
const suites = LIB.filter(v => v.cat === 'suite');

/* ---------- 1. char caps ---------- */
{
  let maxStyle = 0; const over = [];
  for (const v of LIB) {
    const L = len(v.style || '');
    maxStyle = Math.max(maxStyle, L);
    if (L > STYLE_CAP) over.push(`#${v.n} (${L})`);
    if (v.lyric && len(v.lyric) > LYRIC_CAP) over.push(`#${v.n} lyric (${len(v.lyric)})`);
  }
  over.length ? fail(`char cap exceeded: ${over.join(', ')}`) : pass(`all styles <=${STYLE_CAP} chars (max ${maxStyle})`);
}

/* ---------- 2. numbering unique ---------- */
{
  const seen = new Set(), dupes = [];
  for (const v of numbered) {
    if (!Number.isInteger(v.n)) fail(`non-integer numbered entry: ${v.n}`);
    seen.has(v.n) ? dupes.push(v.n) : seen.add(v.n);
  }
  const nums = [...seen].sort((a, b) => a - b);
  dupes.length ? fail(`duplicate entry numbers: ${[...new Set(dupes)].join(', ')}`)
    : pass(`${numbered.length} entries, numbers unique (max ${nums.at(-1)}); 81-95 shelf-allocated`);
}

/* ---------- 3. RECENT resolves ---------- */
{
  const ids = RECENT.entries || [];
  const missing = ids.filter(n => !LIB.some(v => String(v.n) === String(n)));
  missing.length ? fail(`RECENT points at missing entries: ${missing.join(', ')}`) : pass(`RECENT [${ids.join(', ')}] all resolve`);
}

/* ---------- 4. no artist names in prompt text ---------- */
{
  const hits = [];
  for (const v of LIB) {
    const text = `${v.style || ''} ${v.neg || ''}`;
    for (const name of ARTIST_DENYLIST) {
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(text)) hits.push(`#${v.n} → "${name}"`);
    }
  }
  hits.length ? fail(`artist name in prompt text: ${hits.join(', ')}`) : pass(`no artist names in prompt text (denylist of ${ARTIST_DENYLIST.length})`);
}

/* ---------- 5. mandated negatives not pre-baked ---------- */
{
  const baked = [];
  for (const v of LIB) {
    const hit = MANDATED.filter(m => (v.neg || '').toLowerCase().includes(m.toLowerCase()));
    if (hit.length) baked.push(`#${v.n} (${hit.join('/')})`);
  }
  baked.length ? fail(`mandated negatives already in neg field (appended at copy time — remove): ${baked.join(', ')}`) : pass(`neg fields exclude the 5 mandated negatives`);
}

/* ---------- 6. header counts match ---------- */
{
  const sub = (html.match(/<p class="sub">([^<]*)/) || [, ''])[1];
  const nEntries = (sub.match(/(\d+)\s+numbered entries/) || [])[1];
  const nSuite = (sub.match(/(\d+)\s+ungendered suite prompts/) || [])[1];
  String(numbered.length) === nEntries ? pass(`header numbered count matches (${numbered.length})`) : fail(`header says "${nEntries} numbered entries" but data has ${numbered.length}`);
  String(suites.length) === nSuite ? pass(`header suite count matches (${suites.length})`) : fail(`header says "${nSuite} suite prompts" but data has ${suites.length}`);
}

/* ---------- 7. HTML wiring + scripts parse + tags balanced ---------- */
{
  html.includes('<script src="data.js"></script>') ? pass(`HTML loads data.js`) : fail(`HTML does not reference data.js`);
  const blocks = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
  let bad = 0;
  for (const b of blocks) {
    try { new Function(b.replace(/^<script>/, '').replace(/<\/script>$/, '')); } catch (e) { bad++; fail(`script syntax error: ${e.message}`); }
  }
  if (!bad) pass(`${blocks.length} inline script(s) parse`);
  const body = html.replace(/<script>[\s\S]*?<\/script>/g, '');
  for (const tag of ['div', 'section']) {
    const o = (body.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
    const c = (body.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    o === c ? pass(`<${tag}> balanced (${o})`) : fail(`<${tag}> unbalanced: ${o} open / ${c} close`);
  }
}

/* ---------- 8. artist_studies.md: labels match + generated region in sync ---------- */
{
  const md = readFileSync(STUDIES_MD, 'utf8');
  const re = /###[^\n]*\((\d+)\)\s*\n\s*```\n([\s\S]*?)\n```/g;
  let m; const mism = [], overCap = [];
  while ((m = re.exec(md))) {
    if (+m[1] !== len(m[2])) mism.push(`labelled ${m[1]}, actual ${len(m[2])}`);
    if (len(m[2]) > STYLE_CAP) overCap.push(`${len(m[2])}`);
  }
  mism.length ? fail(`artist_studies.md count labels wrong: ${mism.join('; ')}`) : pass(`artist_studies.md char-count labels match`);
  if (overCap.length) fail(`artist_studies.md styles over cap: ${overCap.join(', ')}`);
  try {
    checkInSync() ? pass(`artist_studies.md generated region in sync`) : fail(`artist_studies.md generated region OUT OF SYNC — run: node tools/build.mjs`);
  } catch (e) { fail(`sync check failed: ${e.message}`); }
}

report();

function report() {
  for (const p of passes) console.log(`✓ ${p}`);
  for (const f of fails) console.log(`✗ ${f}`);
  console.log(fails.length ? `\nFAIL (${fails.length} issue${fails.length > 1 ? 's' : ''})` : `\nPASS`);
  process.exit(fails.length ? 1 : 0);
}
