# tools

## validate.mjs

Pre-commit sanity check for `vocal_timbre_library.html` (and `artist_studies.md`).
Run before every commit:

```
node tools/validate.mjs
```

Extracts `LIB` / `RECENT` from the HTML and checks:

- **char caps** — every `style` ≤ 1000, every `lyric` ≤ 5000
- **numbering** — integer entry numbers unique, reports the max
- **RECENT** — every id in the most-recent-batch resolves to a real entry
- **no artist names** — prompt text checked against an artist/band denylist (extend `ARTIST_DENYLIST` in the script)
- **mandated negatives** — the 5 mandated terms must *not* be pre-baked into `neg` fields (they're appended at copy time)
- **header counts** — the masthead's "N numbered entries / M suite prompts" match the data
- **scripts parse + tags balanced** — inline `<script>` blocks compile; `<div>`/`<section>` balanced
- **artist_studies.md** — each `(NNN)` char-count label matches its style block, all ≤ 1000

Exit code is `1` on any failure, `0` on pass, so it can gate a commit hook.
Pass a path as the first arg to validate a different file (used for self-testing).
