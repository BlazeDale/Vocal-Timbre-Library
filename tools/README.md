# tools

The library data lives in **`data.js`** (`LIB`, `RECENT`, `STUDY_META`). The HTML
loads it via `<script src="data.js">` and is view-only — edit entries in `data.js`,
not the HTML. (Two files now, so the page is no longer a single shareable file.)

## build.mjs — regenerate artist_studies.md

Promoted inspirations studies (the `inspiration` entries in `LIB`) are the single
source; `artist_studies.md` is generated from them.

```
node tools/build.mjs          # regenerate the GENERATED region of artist_studies.md
node tools/build.mjs --check  # exit 1 if the file is out of sync (used by validate)
```

Only the region between the `<!-- BEGIN GENERATED … -->` / `<!-- END GENERATED -->`
markers is touched. Studies 1–3 above the marker are hand-authored and left alone.
Study-level prose (temperament note, date) lives in `STUDY_META` in `data.js`, keyed
by the study slug (`fam` minus `"inspirations · "`).

## validate.mjs — pre-commit check

Run before every commit:

```
node tools/validate.mjs
```

Loads `data.js` and checks:

- **char caps** — every `style` ≤ 1000, every `lyric` ≤ 5000
- **numbering** — integer entry numbers unique
- **RECENT** — every id in the most-recent batch resolves to a real entry
- **no artist names** — prompt text vs an artist/band denylist (extend `ARTIST_DENYLIST`)
- **mandated negatives** — the 5 mandated terms must *not* be pre-baked into `neg` (appended at copy time)
- **header counts** — masthead "N numbered / M suite" match the data
- **HTML wiring** — references `data.js`; inline script parses; `<div>`/`<section>` balanced
- **artist_studies.md** — `(NNN)` labels match their prompts, and the generated region is in sync (`build --check`)

Exit `1` on any failure. Pass a path as arg 1 to validate a different `data.js` (self-testing).

## Workflow for adding / editing entries

1. Edit `data.js` (and `STUDY_META` if it's a promoted study).
2. `node tools/build.mjs` — regenerate `artist_studies.md`.
3. `node tools/validate.mjs` — must pass.
4. Commit.
