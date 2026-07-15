#!/usr/bin/env node
/*
 * Generates the "promoted inspirations studies" region of artist_studies.md
 * from the `inspiration` entries in data.js — so a promoted study has ONE
 * source (the library), not two.
 *
 *   node tools/build.mjs           regenerate the region in place
 *   node tools/build.mjs --check   exit 1 if the file is out of sync (for CI)
 *
 * Legacy hand-written studies (outside the markers) are never touched.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data.js');
const MD = join(ROOT, 'artist_studies.md');

export const MARK_BEGIN = '<!-- BEGIN GENERATED — promoted inspirations studies · edit data.js then run: node tools/build.mjs -->';
export const MARK_END = '<!-- END GENERATED -->';

const len = s => [...s].length;

export function loadData(dataPath = DATA) {
  const src = readFileSync(dataPath, 'utf8');
  return new Function(src + '\n; return {LIB, RECENT, STUDY_META};')();
}

const roleRank = r => (/blend/i.test(r) ? -1 : parseInt((r.match(/\d+/) || [99])[0], 10));

export function renderRegion(LIB, STUDY_META = {}, startNumber = 1) {
  const insp = LIB.filter(v => v.cat === 'inspiration');
  const groups = new Map();
  for (const v of insp) (groups.get(v.fam) || groups.set(v.fam, []).get(v.fam)).push(v);

  let studyNo = startNumber;
  const out = [];
  for (const [fam, raw] of groups) {
    const items = raw.slice().sort((a, b) => roleRank(a.role) - roleRank(b.role));
    const slug = fam.replace(/^inspirations · /, '');
    const title = slug.charAt(0).toUpperCase() + slug.slice(1);
    const roots = items.filter(v => /root/i.test(v.role));
    const nums = items.map(v => v.n).sort((a, b) => a - b);
    const range = nums.length > 1 ? `#${nums[0]}–${nums.at(-1)}` : `#${nums[0]}`;
    const meta = STUDY_META[slug] || {};

    out.push(`## Study ${studyNo} — ${title} (blend + ${roots.length} roots)`, '');
    out.push(`*Generated from library entries ${range}${meta.date ? ` · ${meta.date}` : ''} — edit the \`inspiration\` entries in \`data.js\`, then run \`node tools/build.mjs\`.*`, '');
    if (meta.note) out.push(meta.note, '');
    for (const v of items) {
      const sub = /blend/i.test(v.role) ? 'Blend' : `${v.role} · ${v.name.replace(/\s+root$/i, '')}`;
      out.push(`### ${sub} (${len(v.style)})`, '', '```', v.style, '```', '', '```', v.neg, '```', '');
    }
    studyNo++;
  }
  return out.join('\n').trimEnd() + '\n';
}

function startNumberFrom(md) {
  const head = md.slice(0, md.indexOf(MARK_BEGIN));
  const nums = [...head.matchAll(/^## Study (\d+)/gm)].map(m => +m[1]);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

export function computeMd() {
  const { LIB, STUDY_META } = loadData();
  const md = readFileSync(MD, 'utf8');
  const b = md.indexOf(MARK_BEGIN), e = md.indexOf(MARK_END);
  if (b < 0 || e < 0) throw new Error('generated-region markers not found in artist_studies.md');
  const region = renderRegion(LIB, STUDY_META, startNumberFrom(md));
  const next = md.slice(0, b + MARK_BEGIN.length) + '\n\n' + region + '\n' + md.slice(e);
  return { current: md, next };
}

export function checkInSync() {
  const { current, next } = computeMd();
  return current === next;
}

/* ---------- CLI ---------- */
if (process.argv[1] && process.argv[1].endsWith('build.mjs')) {
  const { current, next } = computeMd();
  if (process.argv.includes('--check')) {
    if (current === next) { console.log('✓ artist_studies.md in sync'); process.exit(0); }
    console.log('✗ artist_studies.md OUT OF SYNC — run: node tools/build.mjs'); process.exit(1);
  } else {
    writeFileSync(MD, next, 'utf8');
    console.log(current === next ? 'artist_studies.md already up to date' : 'regenerated artist_studies.md');
  }
}
