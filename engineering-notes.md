# Engineering Notes — API Gotchas & Methodology Lessons

**Status:** living document · all findings verified live against the
enwiki/WDQS APIs during POC development (2026-08-26/27)

Everything here cost real debugging time. Read it before touching the API
layer (`lib/api.js`), the census (`lib/census.js`), or any similar Wikimedia
tooling.

---

## 1. MediaWiki API gotchas (verified live)

### 1.1 `prop=templates`: `tllimit` is a per-REQUEST total, not per-page

With multiple titles in one query, the API returns templates in
**alphabetical title order** and applies the 500-template limit to the whole
request. Consequences:

- Large batches silently truncate template lists **mid-alphabet — exactly
  where "Infobox…" sorts** (first observed: a 40-title batch returned
  `Template:!)` — one template — for pages that had 26).
- When the budget lands **exactly on a page boundary**, the API stops with
  **no continue token** and the remaining pages return empty template lists,
  indistinguishable from genuinely bare pages. Verified: 15 pages consumed
  exactly 500 templates; the last 4 (alphabetically) returned 0.

Mitigation used in `lib/census.js`: 50-title batches + continuation rounds
(mid-page truncation returns a continue token — `tltitle` for single-prop
queries, `tlcontinue` for multi-prop; echo the WHOLE continue object back)
+ **suspect-only re-queue passes**: a batch whose cumulative template count
reached the 500 cap may have starved its trailing pages, so empty results
there are re-queried in 10-title batches; anything still suspect is resolved
with individual queries (a single-title query cannot be starved). Zero
results are only trustworthy after that.

### 1.2 `tltemplates` (the templates filter) — exact names only, no wildcards

`prop=templates&tltemplates=…` filters results, but the values are **exact
template titles**: no `*` wildcards, the `Template:` prefix is required
(namespace part case-insensitive, title part case-sensitive), max 500 values.
Verified: `Template:Reflist` matches, `Template:Infobox election` matches on
a page that has it, `Reflist` (no prefix) and `Template:Inf*` don't. Not
usable for infobox-family census without a full template inventory (future
work — the inventory would also power the specificity ladder).

Note: the parameter's canonical name is `tltemplates` (paraminfo shows the
prefix-stripped short name `templates`; an unknown param is silently
ignored, which returns unfiltered results — easy to mistake for success).

### 1.3 Redirects: don't follow them in censuses; detect via `prop=info`

`redirects=1` resolves redirects, so the response contains the **targets** —
wrong-genre pages that pollute peer sets and break origin lookups (observed:
a "Philip of Swabia" peer that was actually the resolved target of a
redirect). To *detect* redirect pages, query without `redirects=1` and check
the `redirect` key that `prop=info` adds to redirect pages
(`'redirect' in page`). Verified on `USA` (redirect) vs `1346 imperial
election` (not).

### 1.4 pageprops boolean flags are empty strings

`pageprops.disambiguation` is `""` when present — truthiness checks fail.
Use key presence: `'disambiguation' in (page.pageprops ?? {})`.

### 1.5 WDQS/SPARQL quirks

- **Class values come back as full entity URLs** (`http://www.wikidata.org/
  entity/Q832107`) — strip to the bare QID before interpolating into `wd:…`.
  A raw URL produces HTTP 400. (Cost a silent failure: every sibling query
  400'd and the catch swallowed it, faking "P31: 0".)
- **`COUNT()` over huge classes is slow** (10M-instance classes took 60s+).
  Use an early-terminating sample (`LIMIT 501`) and count client-side —
  WDQS stops early, and any class at the cap is "big" by construction.
- **WDQS can hang** — fetch needs a timeout (60s used here) + retry.
- **4xx (except 429) are permanent** — no retry with backoff; 403 means the
  User-Agent is missing/blocked.

### 1.6 Multi-title responses are alphabetized

Multi-title queries return pages **alphabetically**, not in request order —
never assume position == request order (this is why the budget starvation in
§1.1 hits "random" pages from the caller's perspective).

### 1.7 Continuation: `tltitle` vs `tlcontinue` (two different mechanisms)

A single-prop query (`prop=templates` alone) continues with **`tltitle`**.
But as soon as a query has **multiple props** (`prop=templates|pageprops|info`)
— which the census uses — the API switches to the GENERIC continuation:
`continue: '||pageprops|info'` plus the module param **`tlcontinue`**
(`pageid|ns|title`). Checking only `cont.tltitle` silently breaks the loop:
the truncated page's remaining templates (e.g. an infobox that sorts after
"!") are never fetched. Cost a real regression during the web-UI work:
1440 imperial election lost its infobox until `tlcontinue` was honored.
Rule: check `cont.tltitle ?? cont.tlcontinue`, echo back the WHOLE continue
object (`Object.assign(params, cont)`).

### 1.8 `prop=categories` returns no `hidden` flag — use `clshow=!hidden`

`prop=categories` responses contain only `{ns, title}` (plus `hidden` in some
legacy formats — empirically absent in formatversion=2), so `c.hidden`
checks are dead code: hidden maintenance categories (All stub articles,
Webarchive template wayback links, …) leak straight through into peer sets
and bare-cluster evidence. Exclude them at the API with `clshow: '!hidden'`
and additionally regex-filter non-hidden maintenance families (stub
categories are NOT hidden on enwiki — e.g. "Physics stubs" has
`hidden: false` — so a pattern like `/ stubs?$/` is still required).

The ignorable-category set lives in `MAINTENANCE_CATEGORY_RE`
(`lib/peers.js`) — extend it rather than sprinkling filters.

### 1.9 paraminfo is stripped on enwiki

`action=paraminfo` descriptions come back empty on en.wikipedia.org
(`"helpformat":"none"`) — consult mediawiki.org docs for semantics, or
verify behavior empirically (as done for all of the above).

### 1.10 wbgetclaims: one property per call; heavy items via filtered claims

`action=wbgetclaims&entity=Q…&property=P31` accepts a SINGLE property — a
pipe-separated list (`P31|P279`) is rejected with `param-invalid`. Fetch the
properties you need concurrently (7 small calls in the resolve phase, all
cached). Prefer this over `wbgetentities&props=claims` for famous items:
Lincoln's full claims response is ~100KB; the filtered P39 fetch is ~1KB.

### 1.11 `prop=templates` returns LITERAL transcluded names — normalize redirects yourself

A page using {{Infobox NFL team}} (a redirect to {{Infobox gridiron football
team}}) lists the literal name; comparisons and primaries must use the
canonical name. One batched call with `redirects=1` + `prop=templates`
returns BOTH the redirect map and the template's direct transclusions
(which reveal specializations: {{Infobox U.S. state}} transcludes
{{Infobox settlement}}). Cost: one call per run, cached.

**Embedded child boxes**: many articles stack supporting panels that are
*children* of the real box — {{Infobox region symbols}} inside {{Infobox
U.S. state}}, {{Infobox UNESCO World Heritage Site}} on Mount Everest,
{{Infobox designation list}} inside {{Infobox historic site}}, per-element
isotope tables inside {{Infobox element}}. Their templates start with
`{{Infobox | child = …` — detectable when fetching template content — and
must never win primary selection (they are longer than the box they live
in). They are curated in `SUPPORTING_INFOBOXES` + suffix rules (`(meta)`,
` isotopes`); auto-detection via the `child` pattern is future work.

### 1.12 Per-value SPARQL caching beats one mixed query

For same-type pointer discovery (P39/P179/P361), run one query PER value
(`?item wdt:P39 wd:Q11696`), not one query with `VALUES { all values }`:
per-value queries return clean sets (all presidents, not a mix of
Lincoln's five positions) and the URL — and thus the disk cache — is shared
by every item with that value (one POTUS query for all 46 presidents).

### 1.13a Box-style templates do not start with "Infobox"

`{{Speciesbox}}`, `{{Subspeciesbox}}`, `{{Infraspeciesbox}}`, `{{Hybridbox}}` and
`{{Virusbox}}` are infoboxes whose names never contain the string "Infobox", so a
naive `name.startsWith('Infobox')` filter counts a page using one as **bare** —
which inflates "no infobox customary" verdicts for virus and subspecies articles.
`INFOBOX()` in `lib/census.js` therefore carries an explicit list; it is
cross-checked against the Lead Balancer userscript's own `INFOBOX_LIKE` regex
(an independent, editor-maintained statement of the same set) and should be
extended whenever a new box-style template family appears (2026-10-05).

### 1.13 `rvlimit` cannot be combined with multiple titles

`prop=revisions&rvlimit=1&titles=A|B|C` is an error, not a shortcut:

```
invalidparammix: "titles", "pageids" or a generator was used to supply multiple
pages, but the "rvlimit", "rvstartid", "rvendid", "rvdir", "rvuser",
"rvexcludeuser", "rvstart", and "rvend" parameters may only be used on a single page.
```

With several titles the API **already** returns exactly one revision per page, so
**omit `rvlimit`** and batch as many titles as you like — that is the correct way to
get "last edited" for a list of pages in one request (used for the venue-activity
checks behind `outreach.md`). `rvlimit=1` plus a per-title loop also "works", at N
requests instead of one; it cost two failed calls on 2026-10-05 before the error text
was read properly (`engineering-notes.md` §2 exists because of this habit).

## 2. Methodology lessons

### 2.1 Cache staleness on a live corpus masquerades as regressions

The corpus (Wikipedia) changes under you. A warm-cache run can mix responses
fetched days apart, and page edits between runs produce real data shifts. The
"27/31 → 30/31 same-class boxed" phantom regression was stale cache from the
pre-fix (truncated) census era, not a code bug. **When numbers move, verify
against a raw live query and grep the cache before debugging the code.**

### 2.2 Stale-tag labeling: free gold labels from the queue

9% of `Category:Wikipedia articles with an infobox request` members have an
infobox despite the tag (57/601, 2026-08-27) — the template editors chose is
editor consensus. The tagged-article backlog is otherwise 91% genuinely
infoboxless.

### 2.3 The eval loop pays for itself

Fixtures + harness + cache-first API client = decision-logic iterations in
seconds (warm) instead of minutes (cold: ~60s/title, dominated by WDQS).
Measure accuracy on **decisive verdicts only** — abstention (weak-signal) is
a designed outcome, not an error. (Current: 32/6/26, 84% decisive.)

### 2.4 Label quality is a real axis

Editor-choice labels include outliers (trace-fossil articles with an
infobox despite 1% genre coverage), judgment calls (person vs officeholder
for politicians), and weak labels (bare `{{Infobox}}` as "expected").
Document label provenance (see `test/fixtures.json` `labelSource`).

## 3. Etiquette & deployment notes

- Every request needs a descriptive User-Agent (`$WIKIMEDIA_USER_AGENT`),
  ≥1s pacing, Retry-After/backoff on 429 — implemented in `lib/api.js`.
- **Userscript path**: the libs are dual-runtime (global `fetch`); in the
  browser use `{ cacheDir: null, paceMs: 0 }` — enwiki calls are same-origin
  (no CORS), Wikidata works with anonymous `origin=*`.
- **Canonical repo**: github.com/fuzheado/infobox-recommender (private as of
  2026-08-27; flip visibility when ready).
- **Toolforge (deployed 2026-08-27)**: tool `infobox-recommender`;
  <https://infobox-recommender.toolforge.org>. The k8s node runtime serves
  from `~/www/js/` (package.json + server.mjs + lib/ + public/ — the CLI's
  pre-check errors if package.json is missing there). Runtime is `node20`
  (this instance's newest node type). Tool creation is web-UI only
  (toolsadmin); deploy = tar (minus cache/.git) → scp → extract as
  `sudo -iu tools.<tool>` → `webservice --backend=kubernetes node20
  restart`. Verified: 21s cold analyses complete through the proxy; warm
  repeats ~0.15s; SSE streams. Keep the two copies in sync (repo root +
  www/js) or make www/js a symlink farm.
- Disk cache (`cache/`, SHA1-URL-keyed JSON) is the default; re-runs are
  deterministic and instant. Bust it when API semantics change.

## Pacing and caching lessons (2026-10-04)

- **A single global pacing timestamp is not pacing.** Concurrent callers all
  read the same stale value, sleep the same amount and fire together — measured
  bursts of 7 simultaneous Wikidata calls and 5 category-member calls. Enforce
  per-host waves with a bounded concurrency instead (`lib/api.js`).
- **The API will 429 sustained volume, and the budget is not published.** A cold
  crawl of ~2,600 requests in a few minutes got HTTP 429 from
  `en.wikipedia.org/w/api.php`; a 6-request burst does not (200s, no
  `x-ratelimit-*` headers). Treat the 429 as the signal to stop and back off —
  and prefer warming caches politely over re-crawling.
- **Batched requests make URL-keyed caching fragile.** The cache key contains
  the batch composition (`titles=A|B|C`), so changing a batch size invalidates
  every entry even though per-page answers are unchanged. Cache per *entity*
  (`readKeyed`/`writeKeyed`) in addition to per URL.
- **`wbgetclaims` is one property per call — so use `wbgetentities&props=claims`**
  when several properties are needed; it returns them all in one request.
- **A single shared `LIMIT` across a `VALUES` list starves later values.** In
  WDQS, put each value in its own subquery with its own `LIMIT` (UNION of
  subqueries) and re-apply any per-value cap in code.
- **`?v` comes back from WDQS as a full URI**, not a QID — normalise before
  using it as a map key or label lookup.
