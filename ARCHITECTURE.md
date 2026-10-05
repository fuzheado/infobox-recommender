# Architecture — infobox-recommender

Technical companion to [README.md](README.md): how the pipeline works, the
selection rules that decide a peer's primary infobox, the dual-runtime
design, and the web service. Read [engineering-notes.md](engineering-notes.md)
before touching `lib/api.js` (hard-won API gotchas), and see
[test/EVALUATION.md](test/EVALUATION.md) for what the engine gets wrong and
why.

---

## Pipeline (Stages A–C)

`lib/analyze.js` runs the whole thing for one title: resolve + REST summary +
`wbgetclaims` → discovery → census → decision, then (in validate mode) compare
against the existing choice.

### Stage A — peer discovery (`lib/peers.js`)

Three peer sources, each becoming a *tier group* ranked by size, tightest first
— plus one informational signal and one structural filter:

| Source | Notes |
|---|---|
| **P31 (instance-of) siblings** | Per-class cached WDQS samples; classes with >500 instances are dropped as too heterogeneous (a huge class like Q5 "human" would drown the census). |
| **Same-type pointers** | P39 position held, P179 part of the series, P361 part of, P155/P156 preceded/succeeded — queried **per value** (clean sets, cache well), capped at 60, appended after category peers. |
| **Categories** | Ranked by member count via `categoryinfo` — the smallest non-trivial category is the sharpest genre pointer. Intersection + maintenance categories excluded, hidden categories excluded via `clshow=!hidden`. |
| **WikiProject banners** *(informational)* | Not a peer source — evidence about the project that standardizes the subject's infobox. |
| **Structural filters** *(not a source — a filter)* | `SHORTDESC_EXCLUDE` drops set-index/"list of" pages — bare *by convention* — so they don't drag coverage down or create fake bare clusters. |

### Stage B — the census (`lib/census.js`)

- Peers' templates are fetched in **50-title batches** with `prop=templates`.
  `tllimit` is a per-request *total*, so naive large batches are silently
  lossy — the census uses `tltitle`/`tlcontinue` continuation rounds plus
  **suspect-only re-queue passes** to guarantee completeness.
- Template **redirects are normalized** (`{{Infobox prepared food}}` →
  `{{Infobox food}}`).
- **Template facts** (`fetchTemplateFacts`) return the redirect map and the
  direct transclusion graph — the seed for the still-future specificity
  ladder and wrapper merge.
- Each peer's **PRIMARY infobox** is selected (see below) — only primaries
  count in the distribution, so supporting boxes never win.
- **Sub-cluster split**: same-class (P31) peers vs category-only peers, so
  "event vs concept" genre differences are visible.
- **Bare-peer clusters**: categories shared among bare peers reveal a
  possible "no infobox customary" sub-genre.

### Stage C — decision (`lib/decide.js`)

Flat logic first:

- **recommend** when coverage ≥ 50% **and** a dominant template holds ≥ 50%
  of boxed peers (confidence `high` when coverage ≥ 75% and dominance ≥ 70%
  with ≥ 10 peers). A count-1 plurality never fires.
- **byClass override** — the same test applied to the P31 sub-cluster alone
  (needs n ≥ 5) catches the case where a broad peer pool dilutes a tight
  class consensus.
- **none-warranted** when the pool is meaningful (≥ 10 peers) and coverage
  ≤ 15% — or structural cases (thin pool + very low coverage).
- **weak-signal** in the ambiguous middle band (the designed honest answer).

Then a **tiered rescue** for abstentions: a tight circle (≥ 80% coverage,
≥ 70% dominance) confirmed by the wider pool can still recommend.
Every verdict ships its evidence + tier strata.

---

## Primary-infobox selection rules

Choosing the *one* box a peer "has" is where the subtle bugs live
(see `test/EVALUATION.md` §5.7 and the 2026-08-28 subsidiary-box fix).
`primaryInfobox(boxes)` in `lib/census.js`, in order:

1. **Supporting/legacy/meta boxes are excluded outright** — `{{Infobox}}`
   (generic meta), `{{Infobox3cols}}`, medal-record wrappers
   (`Infobox medal templates`), embedded child boxes
   (`Infobox region symbols`, `Infobox UNESCO World Heritage Site`,
   `Infobox designation list`), plus suffix rules: names ending in
   `(meta)` or ` isotopes` (per-element isotope tables).
2. **Generic place boxes are penalized** — `Infobox settlement`,
   `Infobox subdivision` lose to any more specific candidate (a US state
   article stacks both state and settlement boxes).
3. **Subsidiary section boxes are penalized *relative to other candidates*** —
   two rules: a candidate that **extends another candidate's name**
   (`Infobox university` ⊂ `Infobox university rankings`), and a candidate
   whose **final word is a section noun**
   (`rankings?|records?|statistics|honou?rs|championships?|results?|performances?`)
   — which catches the non-prefix variants (`Infobox US university ranking`,
   `Infobox UK university rankings`, `Infobox medal record` under
   `Infobox sportsperson`, `Infobox tennis career statistics`).
   The penalty applies **only when another infobox is present on the page**,
   so a standalone `Infobox award` or rankings box is untouched.
4. **Most specific (longest name) wins** among what remains — that heuristic
   is right for real subject boxes (`Infobox astronaut` ⊂ `Infobox person`,
   `Infobox officeholder` ⊂ `Infobox person`), which is why steps 1–3 exist
   to keep *non-subject* boxes out of the race.

Guarded by unit tests: `npm test` (`test/census.test.mjs`).

---

## Dual-runtime design

The `lib/` modules are pure logic plus a thin `fetch` layer, so the same
files back three runtimes:

| Runtime | Notes |
|---|---|
| Node CLI (`cli.js`) | Full pacing + disk cache |
| Web service (`server.mjs`) | Same pipeline, SSE progress |
| **Future userscript** | `createApi({ cacheDir: null, paceMs: 0 })` — enwiki calls are same-origin, Wikidata needs `origin=*` CORS (anonymous read-only, supported) |

## Module map

| Path | Role |
|---|---|
| `lib/api.js` | Action API + WDQS client: descriptive UA, ≥1s request pacing, retry/backoff honoring `Retry-After`, cache-first SHA1-URL-keyed disk cache (`cache/`). Uses global `fetch` (Node ≥18 / browser). |
| `lib/peers.js` | Stage A (above) |
| `lib/census.js` | Stage B (above) + primary selection |
| `lib/decide.js` | Stage C (above) + evidence builder |
| `lib/analyze.js` | Whole pipeline for one title; validate comparison |
| `lib/usage.js` | Privacy-preserving usage log (allowlist fields, host-only referrers, 90-day raw retention, counts-only aggregates) |
| `lib/stats-page.js` | Server-rendered `/stats` page (all values escaped) |
| `lib/rate-limit.js` | Per-client sliding-window limiter (sustained + burst), proxy-aware client IP, bucket pruning |
| `cli.js` | CLI harness (exploration, batch runs) |
| `server.mjs` | Zero-dependency web service |
| `public/` | Report renderer (`app.js`), styles, page shell |

## Web service

- `/?title=X` — HTML report (shareable URL)
- `/analyze/stream?title=X` — SSE: stage events (resolve → peers →
  census i/n → clusters → decide), plus `digest` and `wikidata` events
- `/analyze?title=X&output=json` — full analysis JSON, CORS-enabled
- `/random` — 302 to `/` with a random article from the infobox-request
  backlog (the `{{Infobox requested}}` tag sits on talk pages, so the picker
  strips `Talk:` and rejects non-article talk pages; the member list is cached
  with a daily cache-buster, and the last 25 picks are not repeated)
- `/stats[?output=json]` — aggregate usage stats (HTML / JSON)
- `validate=1` — validate mode (also on the JSON API)

While the census runs, an **article digest** renders immediately (title,
short description, lead extract, thumbnail, infobox status, Wikidata line)
so there is something to read during the wait.

**Guards** (`lib/rate-limit.js`):

- **2 concurrent analyses max** — excess requests queue; throughput is bounded
  by the shared upstream pacer (≥1s between Wikimedia request starts) anyway.
- **Per-client limits, deliberately generous**: **150 analyses / 15 min**
  sustained plus **40 / min** burst (env-tunable: `RATE_MAX`, `RATE_WINDOW_MS`,
  `BURST_MAX`, `BURST_WINDOW_MS`). A Lead Balancer reviewer walking a topic
  cluster is normal use, not abuse — the old 30-per-5-minutes cap could 429 a
  real session. Over the line → **429** with `Retry-After`.
- **Cross-IP flood guard**: when the queue is already ≥ `MAX_QUEUE` (40) deep,
  answer **503** with `Retry-After` instead of growing unbounded.
- **Client identity** from the proxy's `X-Forwarded-For` *last hop* (the value
  our own ingress appends — spoof-resistant) or `X-Real-IP`, falling back to
  the socket address. **Verified live 2026-10-03:** Toolforge's ingress sends
  `X-Forwarded-For` (no `X-Real-IP`), so per-client buckets are real. Before
  this change the app bucketed on `socket.remoteAddress` — the *proxy* — which
  made the old 30-per-5-minutes cap effectively **global**: one busy client
  could throttle everybody, and everyone shared one allowance.
- `/stats` reports whether those proxy headers were seen (`clientIdentification`;
  booleans only) so this stays verifiable.
- Limiter buckets for idle clients are swept every 5 minutes.
- Plus title sanitization and path-traversal protection.

Covered by `test/rate-limit.test.mjs`: a realistic 50-analysis session is
asserted to pass, while a tight loop, a sustained flood, per-client isolation,
and bucket pruning are all tested.

## Usage logging & `/stats`

`lib/usage.js` records one line per analysis (and one per page load) into
monthly JSONL files under `usage/` (gitignored, sibling of `cache/`), and
serves aggregates at `/stats`.

The privacy design is deliberate and tested (`test/usage.test.mjs`):

| Decision | Why |
|---|---|
| **No IPs, no User-Agents, no cookies, no session ids** — ever read or stored | Toolforge's own web logs hold IPs (access-restricted); we don't duplicate them |
| Records built from an **explicit field allowlist** | an unexpected header cannot leak into the log |
| Referrers reduced to **host only** | paths/queries can carry watchlists, search terms, tokens |
| Raw per-analysis records **pruned at 90 days** (startup + daily) | user-identifiable in the weak sense that they name an article |
| Aggregates are **counts only, month granularity**, kept indefinitely | not identifiable, so the totals survive pruning |
| Public `/stats` shows **counts, never titles**; no day-level breakdown | day-level activity can reveal an individual's working pattern |
| Per-title detail stays server-side for the maintainer | supports adoption analysis without publishing it |

Maintainer-side report (per-day counts, per-article detail, and adoption
tracking — whether "recommend" verdicts were later acted on):

```sh
node scripts/usage-report.mjs --days 30 [--titles] [--adoption]
```

## Performance & caching

Cold analyses are **bounded by request count, not by CPU**: every request to a
Wikimedia service is spaced by a gate, so wall time ≈ (waves of requests) +
exposed latency. Measuring is therefore about counting requests — use
`node scripts/bench-analysis.mjs "<title>" [--full] [--cached]`, which wraps
`fetch` and prints a per-request timeline.

**The pacing policy (explicit since 2026-10-04):** one *wave* per host per
second, ≤ `maxPerWave` (4) requests per wave, ≤ 4 in flight per host. Gates are
**per host**, so enwiki, Wikidata and WDQS cannot block each other. Before this
the gate was a single global timestamp that let a batch of parallel calls all
fire at once (measured: 7 simultaneous Wikidata calls), and one slow WDQS query
(4.2s) stalled the next enwiki wave.

**Measured cold runs** (2026-10-04, `cache/` bypassed):

| Case | Before | After | Requests |
|---|---|---|---|
| Canut revolts (112 peers) | 20.4s | **6.6s** | 30 → 26 |
| Abraham Lincoln (147 peers, full census) | 26.8s | **13.7s** | 53 → 50 |
| Zuiderzee Works (17 peers) | ~4.0s | 5.5s | 16 |

What produced the gains:

1. **Parallel census batches** — `fetchPageData` looped batches sequentially
   (one pacing slot each) and drained each batch's 500-row continuation rounds
   in series. Batches now run concurrently, and a smaller first-pass batch
   (25 titles) shortens those chains: on template-heavy peers the chain, not the
   wave rate, was the bottleneck.
2. **One Wikidata request instead of seven** — `wbgetentities&props=claims`
   returns every property, so the seven per-property `wbgetclaims` calls (which
   the API requires to be one property at a time) collapsed into one.
3. **One WDQS query per pointer property instead of one per value** — a
   politician with six P39 values used to fan out to six queries (up to 19
   across P39/P179/P361). Each value keeps its **own** `LIMIT 60` inside a UNION
   of subqueries: a single shared `LIMIT` starves later values (measured: George
   Washington lost 19 officeholder peers and flipped to weak-signal).
4. **Per-page cache** (`cache/templates/<sha1(title)>.json`) beside the
   URL cache. Batched responses are cached under a key containing the batch
   composition, so changing a batch size used to invalidate *everything* — one
   such change turned a warm eval into a ~2,600-request crawl and tripped the
   API's 429. Per-page entries make batch shapes free to change and let peer
   sets be reused across articles. `scripts/migrate-census-cache.mjs` harvests
   per-page data out of an existing URL cache.

Repeat analyses remain instant (URL cache); the per-page cache extends that to
*overlapping* analyses — an article whose peers were already censused skips
those fetches entirely.

## Known limitations

- **Noisy categories** need stronger sub-clustering; the P31-class split plus
  bare-peer shared-category clusters are the first cut — category-only peers
  can still be the wrong genre (people-in-category vs institution article).
- **Huge P31 classes** (Q5 human, "noble title") are skipped — those articles
  fall back to the category signal alone.
- **Template specificity ladder** not implemented: the engine picks the mode
  template rather than walking the taxonomy (publisher ⊂ company,
  officeholder ⊂ person). Bare `{{Infobox}}` never wins, but near-miss
  disagreements remain (`test/EVALUATION.md` §4.2).
- **Stage D** (Wikidata fill-rate draft preview) not implemented.
- **Sidebars** are detected and reported but don't yet veto a recommendation.

## Project history

Seven campaigns took the pipeline from 11% → 90% decisive accuracy: census
correctness (`tllimit`/continuation/self-heal), decision hardening, signal
upgrades (`categoryinfo` selection, shortdesc filter), the maintenance-category
filter, primary-infobox selection, tiered neighborhoods, Wikidata same-type
pointers + the canonical corpus, and (2026-08-28) subsidiary section-box
detection + the unit suite.

Per-case deltas, every bug, and the failure analysis live in
[`test/EVALUATION.md`](test/EVALUATION.md) and
[`test/results/`](test/results/) (the reproducibility record). The research
lineage is [`infobox-recommendation.md`](infobox-recommendation.md) (spec) and
[`signals.md`](signals.md) (signal hypotheses).
