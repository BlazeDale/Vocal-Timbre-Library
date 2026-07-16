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
import { loadHashes, findDenied } from './denylist.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(ROOT, 'vocal_timbre_library.html');
const STUDIES_MD = join(ROOT, 'artist_studies.md');

const STYLE_CAP = 1000;
const LYRIC_CAP = 5000;
const MANDATED = ['Harmonic stagnation', 'Dynamic flattening', 'Quantized sterility', 'Structural monotony', 'Predictability'];

const len = s => [...s].length;
const fails = [], passes = [];
const fail = m => fails.push(m);
const pass = m => passes.push(m);

/* ---------- load data ---------- */
let LIB, RECENT, VERSION, UPDATED;
try {
  ({ LIB, RECENT, VERSION, UPDATED } = loadData(process.argv[2]));
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

/* ---------- 4. no artist names in visible/prompt fields (hashed guard + artist-leak) ----------
   The hidden `artist` field is the ONE sanctioned place for a name (search-only, never
   rendered, never in a prompt). Visible/prompt fields (name/fam/style/neg) and RECENT.label
   must stay name-free; and the hidden artist must not leak INTO a visible field. */
{
  const hashes = loadHashes();
  const hits = [];
  for (const v of LIB) {
    const visible = `${v.name || ''} ${v.fam || ''} ${v.style || ''} ${v.neg || ''}`;
    const found = findDenied(visible, hashes);
    if (found.length) hits.push(`#${v.n} → ${found.join(', ')}`);
    if (v.artist) {
      const re = new RegExp(`\\b${v.artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(visible)) hits.push(`#${v.n} → hidden artist "${v.artist}" leaked into a visible/prompt field`);
    }
  }
  const inLabel = findDenied(RECENT.label || '', hashes);
  if (inLabel.length) hits.push(`RECENT.label → ${inLabel.join(', ')}`);
  if (!hashes.size) fail(`denylist empty — seed it: node tools/denylist.mjs add "Name"`);
  else hits.length ? fail(`artist name in a visible/prompt field: ${hits.join('; ')}`) : pass(`no artist names visible (${hashes.size} hashed; artist search-key allowed)`);
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

/* ---------- 6. version stamp + masthead derives at runtime ---------- */
{
  VERSION ? pass(`version stamp set (${VERSION} · ${UPDATED})`) : fail(`data.js missing VERSION/UPDATED`);
  const wired = ['id="ver"', 'id="sub"', 'document.title='].filter(s => html.includes(s));
  wired.length === 3 ? pass(`masthead/title derive from data at runtime`) : fail(`masthead derivation wiring missing: ${['id="ver"', 'id="sub"', 'document.title='].filter(s => !html.includes(s)).join(', ')}`);
  // guard against stale hardcoded counts sneaking back into the static head
  if (/<title>[^<]*\d+ entries/.test(html)) fail(`static <title> hardcodes a count — leave it count-free (derived at runtime)`);
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
