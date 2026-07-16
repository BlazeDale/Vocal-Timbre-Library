#!/usr/bin/env node
/*
 * Artist/band-name guard — WITHOUT writing any name into the repo.
 *
 * Rule: artist/band names may be spoken (chat, CLI args, memory) but are never
 * written into the tracked files — not prompts, not labels, not metadata, and
 * not even this denylist. So we store only SHA-256 hashes of the forbidden
 * names in denylist.hashes.json; the plaintext never lands on disk.
 *
 *   node tools/denylist.mjs add "Some Band" "Another Act"   # append hashes (names are ephemeral CLI args)
 *   node tools/denylist.mjs count                           # how many hashes are stored
 *
 * validate.mjs imports findDenied() to flag any prompt text whose word n-grams
 * hash to a stored value. Runtime match output prints the offending phrase to
 * the console (transient) but it is never persisted.
 */
import crypto from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HASHES = join(dirname(fileURLToPath(import.meta.url)), 'denylist.hashes.json');
const MAX_WORDS = 4;                       // longest band name (in words) we detect

const norm = s => s.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
const hash = s => crypto.createHash('sha256').update(norm(s)).digest('hex');

export function loadHashes() {
  return existsSync(HASHES) ? new Set(JSON.parse(readFileSync(HASHES, 'utf8'))) : new Set();
}

// Any 1..MAX_WORDS word window of `text` whose hash is denylisted → returned (readable, for the error line).
export function findDenied(text, hashes = loadHashes()) {
  if (!hashes.size) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const hits = new Set();
  for (let i = 0; i < words.length; i++) {
    for (let w = 1; w <= MAX_WORDS && i + w <= words.length; w++) {
      const gram = words.slice(i, i + w).join(' ').replace(/[^\p{L}\p{N} ]/gu, '').trim();
      if (gram && hashes.has(hash(gram))) hits.add(gram);
    }
  }
  return [...hits];
}

/* ---------- CLI ---------- */
if (process.argv[1] && process.argv[1].endsWith('denylist.mjs')) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'add') {
    const set = loadHashes();
    let added = 0;
    for (const name of rest) { const h = hash(name); if (!set.has(h)) { set.add(h); added++; } }
    writeFileSync(HASHES, JSON.stringify([...set].sort(), null, 0) + '\n', 'utf8');
    console.log(`added ${added}, ${set.size} total (names not stored — only hashes)`);
  } else if (cmd === 'count') {
    console.log(`${loadHashes().size} denylisted hashes`);
  } else if (cmd === 'hash') {
    // Print the SHA-256 search-key for an artist name (name stays an ephemeral CLI
    // arg — never stored). Paste the hex into a data.js entry's `artist` field.
    if (!rest.length) { console.log('usage: node tools/denylist.mjs hash "Artist Name"'); process.exit(1); }
    for (const name of rest) console.log(hash(name));
  } else {
    console.log('usage: node tools/denylist.mjs add "Name" ["Name"...] | hash "Name" | count');
    process.exit(1);
  }
}
