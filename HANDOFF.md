# HANDOFF — infobox-recommender

**Last updated:** 2026-08-28 · **For:** whoever continues this project next
(probably Andrew, after a break). This is the "where things stand and how to
move forward" doc — methodology details live in the docs it points to.

---

## Status at a glance

A peer-census infobox recommender for English Wikipedia: for an article with
no infobox, discover its peers (Wikidata classes + same-type pointers,
categories, WikiProject banners), census what infoboxes they carry, and
recommend a template — or honestly abstain.

- **Evaluation: 57 pass / 6 fail / 25 abstain — 90% accuracy on decisive
  verdicts** (88-case corpus: 57 backlog-derived stale-tag labels + 31
  manual/canonical validate)
- **Deployed:** <https://infobox-recommender.toolforge.org> (Toolforge k8s,
  node20) · **Repo:** <https://github.com/fuzheado/infobox-recommender>
  (PRIVATE — flip visibility when ready to share)
- **Progress:** 11% → 83% → 71% → 73% → 75% → 84% → 85% → 84% → 85% → 86% →
  90% across six campaigns (full history in `test/EVALUATION.md`)

## Quick start (local)

```sh
node cli.js "1346 imperial election"            # full pipeline, human summary
node cli.js "Abraham Lincoln" --validate        # validate an existing infobox
node cli.js "X" --json                          # machine-readable
npm run serve                                   # web UI at localhost:3000
npm run eval                                    # full evaluation (warm: <1s)
npm test                                        # unit tests (test/census.test.mjs)
npm run fixtures                                # rebuild test/fixtures.json
```

Etiquette is baked into `lib/api.js`: descriptive UA, ≥1s pacing,
retry/backoff, cache-first disk cache (`cache/`, gitignored). Cold analyses
run 5–30s; repeats are instant.

## Where everything lives

| Path | Role |
|---|---|
| `lib/api.js` | Action API + WDQS client (etiquette, pacing, retries, disk cache) |
| `lib/peers.js` | Stage A: P31 siblings (per-class cached samples), same-type pointers (P39/P179/P361/P155/P156), member-count category selection, banners; tier groups |
| `lib/census.js` | Stage B: 50-title batched template census (continuation + re-queue passes), redirect normalization, transclusion facts, primary-infobox selection, sub-cluster split |
| `lib/decide.js` | Stage C: flat decision + tieredEvaluate rescue; evidence builder |
| `lib/analyze.js` | Full pipeline for one title (resolve + REST summary + wbgetclaims → discovery → census → decision); validate comparison |
| `cli.js` | CLI harness |
| `server.mjs` | Zero-dep web service (report UI, SSE progress, JSON API, validate mode) |
| `public/` | Report renderer, digest card, About modal, tier panel |
| `test/eval.mjs` | Evaluation harness (persists `test/results/<date>.json|.md`) |
| `test/census.test.mjs` | Unit tests — primary-infobox selection (supporting/subsidiary boxes, penalties, specificity); `npm test` |
| `scripts/fetch-queue.mjs` | Rebuilds fixtures from the live backlog |
| `scripts/manual-cases.json` | Manual + canonical seed cases |
| `status-quo.md` | Need assessment — how editors add infoboxes today (workflows, friction, prior art, honest market assessment) |
| `ROADMAP.md` | What's next — prioritized features (engine + reach tracks), effort, eval targets |

## The recommender in 10 minutes

1. **Resolve** the article (redirects, QID, its own templates, REST summary
   for the digest). If it already has an infobox → "already-has-infobox",
   or run `validate` to compare its choice against peer practice.
2. **Discover peers** from five signals, each becoming a *tier group* ranked
   by size (tightest first):
   - P31 (instance-of) siblings — classes >500 instances dropped
   - Same-type pointers: P39 position held, P179 part of the series, P361
     part of, P155/P156 preceded/succeeded — per-VALUE queries (clean sets,
     cached per value), capped at 60, appended after category peers
   - Categories ranked by member count (intersection/maintenance excluded)
   - WikiProject banners (informational)
3. **Census** each peer's templates: 50-title batches with `tltitle`/
   `tlcontinue` continuation rounds + suspect-only re-queue passes;
   redirects normalized (prepared food → food); per-peer PRIMARY selected
   (supporting/child/meta boxes excluded; generic-place penalty; subsidiary
   section boxes — {{Infobox university rankings}}, medal records, career
   statistics — lose to the subject box).
4. **Decide**: flat logic (coverage + dominance thresholds, byClass
   override with share ≥ 0.5, structural none-warranted) with a tiered
   rescue for abstentions (tight circle ≥80%/≥70% + wider-pool
   confirmation). Every verdict ships its evidence + tier strata.

## The evaluation harness — how to add ground truth

Corpus = `test/fixtures.json` (88 cases: 57 backlog-derived stale-tag
labels + 31 manual/canonical). Expectation formats:

| expected | semantics |
|---|---|
| `"Infobox person"` | recommend that template (or none-warranted = fail) |
| `"none"` | none-warranted expected |
| `"consistent[:Template]"` | validate mode: existing infobox must match peer practice |

**To add a case:** append `{title, expected, labelSource}` to
`scripts/manual-cases.json`, run `npm run fixtures`, then `npm run eval`.
Unit tests: `npm test` (test/census.test.mjs) — run after any
census/selection changes.
Labels are editor-choice (stale-tag) or canonical set-membership
(presidents/states/foods…) — see `test/EVALUATION.md` §1 for the
methodology and caveats. Long-tail expansion is the natural next corpus
step.

## Deployment (Toolforge)

- Tool `infobox-recommender` (created via toolsadmin web UI), runtime
  `node20` (this instance's newest node type)
- The k8s node type serves from **`~/www/js/`** — a copy of
  server.mjs + lib/ + public/ + package.json (the CLI pre-check errors
  without package.json there)
- **Redeploy:** package repo (minus cache/.git), scp, extract as the tool
  user into both `/data/project/infobox-recommender/` and `.../www/js/`,
  chown, restart:

```sh
tar czf /tmp/ibr.tgz --exclude=cache --exclude=.git -C . .
scp /tmp/ibr.tgz alih@dev.toolforge.org:/tmp/
ssh alih@dev.toolforge.org "sudo -u tools.infobox-recommender -i bash -c \
  'cd /data/project/infobox-recommender && tar xzf /tmp/ibr.tgz; \
   cd www/js && tar xzf /tmp/ibr.tgz; \
   chown -R tools.infobox-recommender: . ; \
   webservice --backend=kubernetes node20 restart'"
```

- Verified: 21s cold analyses complete through the proxy (no timeout);
  warm repeats ~0.15s; SSE streams fine. `LICENSE` (MIT) present per
  Toolforge Rule #2.

## Hard-won API lessons

All in `engineering-notes.md` — read it before touching the API layer. The
short list: `tllimit` is a per-request TOTAL (silent boundary truncation);
continuation is `tltitle` (single-prop) vs `tlcontinue` (multi-prop);
`prop=templates` returns literal names (normalize redirects yourself);
`prop=categories` returns NO hidden flag (use `clshow=!hidden`);
`wbgetclaims` is one property per call; per-value SPARQL queries cache
better than mixed VALUES; WDQS needs timeouts; 4xx ≠ retryable.

## Known limitations & open threads (pick up here)

1. **Semantic sub-clustering** (lead/extract embeddings or ORES topics) —
   the doc's big lever for the remaining abstains and concept-genre cases
   (`signals.md` H3). Venue: `lib/peers.js` / `lib/decide.js`.
2. **Specificity ladder** — template-category taxonomy to pick the most
   specific template (publisher ⊂ company; officeholder ⊂ person). The
   transclusion facts already fetched per run are the seed.
3. **Per-element wrapper merge** (Oxygen) — {{Infobox americium}} wraps
   {{Infobox element}}; a transclusion-based merge would unify the class.
4. **Child-box auto-detection** — supporting boxes are curated today;
   templates starting with `{{Infobox | child = …` could be detected.
5. **Stage D** — Wikidata fill-rate draft infobox preview.
6. **Userscript** — libs are runtime-agnostic; the report renderer
   transfers; `{ cacheDir: null, paceMs: 0 }` in-browser.
7. **Repo visibility** — flip to public when ready; the About modal links
   the repo.

## Campaign history (why the numbers moved)

1. Census correctness (tllimit/continuation/self-heal) + decision hardening
2. Signal upgrades (categoryinfo selection, shortdesc filter) — 75→84%
3. Maintenance-category filter (`clshow=!hidden`) — 84→85%
4. Primary-infobox selection (honest-correction dip to 84%)
5. Tiered neighborhoods + intersection exclusion (Dallas Cowboys) — 85%
6. Wikidata same-type pointers + canonical corpus — 86→90%
7. Subsidiary section-box detection (rankings/medal-record boxes lose to
   the subject box) + unit test suite + UI fixes — 2026-08-28 (90% steady;
   corpus 87 → 88)

Per-case deltas, failure analysis, and every bug are in
`test/EVALUATION.md`; hypotheses in `signals.md`.

## Working conventions

- **Cache-first:** warm eval runs are <1s — iterate cheaply. Bust `cache/`
  when API semantics change; grep cache JSONs to explain phantom
  regressions before touching code (a stale cache once faked one).
- **Verify against the live API** when numbers move unexpectedly — the
  corpus is a live wiki and pages change under you.
- Keep `test/results/latest.*` committed; they are the reproducibility
  record.
- Two code copies exist (repo root + Toolforge www/js) — redeploy after
  lib/server changes, not just doc changes.
