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
- **no artist names** — entry name/fam/style/neg **and** `RECENT.label` checked against a hashed denylist (see below); names never appear in the repo
- **mandated negatives** — the 5 mandated terms must *not* be pre-baked into `neg` (appended at copy time)
- **version stamp + masthead** — `VERSION`/`UPDATED` set; title/counts derive at runtime; static `<title>` stays count-free
- **HTML wiring** — references `data.js`; inline script parses; `<div>`/`<section>` balanced
- **artist_studies.md** — `(NNN)` labels match their prompts, and the generated region is in sync (`build --check`)

Exit `1` on any failure. Pass a path as arg 1 to validate a different `data.js` (self-testing).

## denylist.mjs — artist-name guard (name-free)

Artist/band names may be **spoken** (chat, CLI args, memory) but are **never written**
into the tracked files — prompts, labels, metadata, none of it. To keep a guard without
storing names, `denylist.hashes.json` holds only SHA-256 hashes:

```
node tools/denylist.mjs add "Some Band" "Another Act"   # append hashes; names are ephemeral CLI args
node tools/denylist.mjs count
```

`validate.mjs` hashes the word n-grams of every entry (and `RECENT.label`) and flags any
match. Add a name here whenever you start a new artist study.

## pre-commit hook (commit gate)

`tools/hooks/pre-commit` runs `validate.mjs` and blocks the commit if it fails.
It's wired via `core.hooksPath`, so it's version-controlled — but each clone must
opt in once:

```
git config core.hooksPath tools/hooks
```

Bypass in a pinch with `git commit --no-verify`.

## Version / counts

Bump `VERSION` / `UPDATED` in `data.js` — the only place. The `<title>`, `<meta>`,
masthead heading, sub-line, and footer all derive from those + `LIB` counts at
runtime, so entry counts never need hand-editing and can't go stale.

## Workflow for adding / editing entries

1. Edit `data.js` (and `STUDY_META` if it's a promoted study; bump `VERSION`/`UPDATED` if releasing).
2. `node tools/build.mjs` — regenerate `artist_studies.md`.
3. `node tools/validate.mjs` — must pass (the hook runs this too).
4. Commit.
