# HANDOFF — infobox-recommender

**Last updated:** 2026-10-04 · **For:** whoever continues this project (probably
Andrew, after a break).

**How to use this doc:** §1–2 to know where things stand and run it; §4–5 if you
have to deploy or debug the live service; §6 if you are about to touch the API
layer; §8–9 for what is open. Deeper material lives in the other docs — this one
tells you which.

---

## 1. Status at a glance

A peer-census infobox recommender for English Wikipedia: for an article with no
infobox, discover its peers (Wikidata classes + same-type pointers, categories,
WikiProject banners), census what infoboxes they carry, and recommend a template
— or honestly abstain.

| | |
|---|---|
| **Evaluation** | **57 pass · 6 near-miss disagreements · 25 honest abstentions — 90% on decisive verdicts** (88-case corpus: 57 backlog-derived stale-tag labels + 31 manual/canonical). 4 of the 6 disagreements are cases where peer evidence arguably beats one editor's choice (`test/EVALUATION.md`) |
| **Unit tests** | 25 (`npm test`): primary-infobox selection, usage-log privacy/retention, rate limiting, random-article picker |
| **Cold / warm speed** | ~10–25s cold for a heavy article (≈150 peers), instant warm — measured with `scripts/bench-analysis.mjs` |
| **Live** | <https://infobox-recommender.toolforge.org> · usage stats at [`/stats`](https://infobox-recommender.toolforge.org/stats) |
| **Repo** | <https://github.com/fuzheado/infobox-recommender> — **public** since 2026-08-28, MIT; homepage set to the tool, topics `wikipedia/wikidata/infobox/mediawiki/toolforge` |
| **External consumer** | **Lead Balancer** (`User:Sadads/LeadBalancer-core.js`) calls `/analyze?output=json` for infobox-less articles — see §7. It is the main traffic source; mind the contract |
| **Observed use** | 70 analyses in the pre-logging era (2026-08-27 → 10-02), 2 infobox additions by named editors, 1 census artifact found — `usage-history.md`. Counts since 2026-10-03 come from the usage log: see the live `/stats` |
| **Engine trajectory** | 11% → 83% → 71% → 73% → 75% → 84% → 85% → 84% → 85% → 86% → **90%** over seven campaigns (`test/EVALUATION.md`) |

## 2. Quick start (local)

```sh
node cli.js "1346 imperial election"       # full pipeline, human summary
node cli.js "Abraham Lincoln" --validate   # check an existing infobox choice
node cli.js "X" "Y" --json                 # machine-readable
npm run serve                              # web UI on http://localhost:3000
npm test                                   # 25 unit tests
node scripts/bench-analysis.mjs "X" --full # request-level timing audit (cold)
npm run eval                               # full evaluation (warm cache: <1s)
npm run fixtures                           # rebuild test/fixtures.json from the live backlog
node scripts/usage-report.mjs --days 30    # maintainer usage report (needs a usage/ dir)
```

Etiquette is baked into `lib/api.js`: descriptive UA, per-host request waves
(≥1s apart, ≤4 in flight per service), retry/backoff, cache-first disk cache
(`cache/`, gitignored). A heavy cold analysis runs ~10–25s; repeats and
overlapping analyses are instant. `cache/` and `usage/` are gitignored — never commit them.

## 3. Where things live

**Pipeline** (pure logic + a thin `fetch` layer; same files run in Node, the web
service, and a future userscript):

| Path | Role |
|---|---|
| `lib/api.js` | Action API + WDQS client — etiquette, pacing, retries, disk cache |
| `lib/peers.js` | Stage A: P31 siblings, same-type pointers (P39/P179/P361/P155/P156), member-count category selection, banners; tier groups |
| `lib/census.js` | Stage B: batched template census (continuation + re-queue), redirect normalization, transclusion facts, **primary-infobox selection**, sub-cluster split |
| `lib/decide.js` | Stage C: flat decision + tiered rescue; evidence builder |
| `lib/analyze.js` | Whole pipeline for one title; validate comparison |
| `lib/usage.js` · `lib/stats-page.js` · `lib/rate-limit.js` · `lib/random-pick.js` | Usage log, `/stats` renderer, per-client limiter, random-article picker |
| `cli.js` · `server.mjs` · `public/` | CLI harness, zero-dep web service, report UI |
| `images/` | README screenshots |

**Tests & evaluation:** `test/eval.mjs` (harness → `test/results/<date>.*`),
`test/census.test.mjs`, `test/usage.test.mjs`, `test/rate-limit.test.mjs`,
`test/random-pick.test.mjs`,
`test/fixtures.json` (corpus), `scripts/manual-cases.json` + `scripts/fetch-queue.mjs`
(how the corpus is built), `test/EVALUATION.md` (writeup).

**Research & tooling:** `scripts/research/` — `extract-cache-inventory.py`,
`adoption-analysis.mjs`, `phantom-box-check.mjs`, `build-usage-history.mjs`
(usage/adoption), plus the cross-edition pipeline (steps 1–4) behind
`infobox-naming.md` / `wikiprojects-and-i18n.md`. Also
`scripts/bench-analysis.mjs` (request-level timing audit — the tool behind the
2026-10-04 speedups) and `scripts/migrate-census-cache.mjs` (harvests per-page
template data into `cache/templates/`).

**Docs — read the one that matches your question:**

| Question | Doc |
|---|---|
| What does this tool do, for a newcomer? | [`README.md`](README.md) |
| How does the pipeline work, and why these rules? | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Is this tool actually needed? What do editors do today? | [`status-quo.md`](status-quo.md) |
| What did real usage look like, and did anyone act on it? | [`usage-history.md`](usage-history.md) (+ `.json`) |
| Where do I tell people this exists? | [`outreach.md`](outreach.md) |
| What should I build next? | [`ROADMAP.md`](ROADMAP.md) |
| What does the engine get wrong? | [`test/EVALUATION.md`](test/EVALUATION.md) |
| What data is logged, and for how long? | [`PRIVACY.md`](PRIVACY.md) |
| API traps that already cost us time | [`engineering-notes.md`](engineering-notes.md) |
| Original research spec / hypotheses | [`infobox-recommendation.md`](infobox-recommendation.md), [`signals.md`](signals.md) |
| Other-language editions (porting math) | [`wikiprojects-and-i18n.md`](wikiprojects-and-i18n.md), [`infobox-naming.md`](infobox-naming.md) |

## 4. The recommender in 10 minutes

1. **Resolve** the article (redirects, QID, own templates, REST summary for the
   digest). Already has an infobox → "already-has-infobox", or `validate` to
   compare its choice against peer practice.
2. **Discover peers** — three peer sources, each a *tier group* ranked tightest
   first: P31 siblings (classes >500 instances dropped as too heterogeneous);
   same-type pointers (per-VALUE `P39`/`P179`/`P361` sets plus `P155`/`P156`
   chains, capped at 60); categories ranked by member count (`categoryinfo`,
   smallest non-trivial = sharpest genre pointer, intersections/maintenance
   excluded). WikiProject banners are fetched as *informational* evidence, not
   peers, and `SHORTDESC_EXCLUDE` drops list/set-index pages from the pool.
3. **Census** peers' templates in batches with `tltitle`/`tlcontinue`
   continuation rounds plus suspect-only re-queue passes; redirects normalized;
   one **PRIMARY** infobox per peer (supporting/child/meta boxes excluded;
   generic-place penalty; subsidiary section boxes — university rankings, medal
   records, career statistics — lose to the subject box).
4. **Decide:** coverage ≥50% + dominant ≥50% of boxed peers → recommend (with a
   `byClass` override for tight classes); meaningful pool with ≤15% coverage →
   none-warranted; otherwise weak-signal, with a tiered rescue for abstentions
   (tight circle ≥80% coverage / ≥70% dominance, confirmed by the wider pool).
   Every verdict ships its evidence and tier strata.

## 5. Deployment (Toolforge)

- Runtime **`node20`** (newest node type on this instance); the platform runs
  **`npm start`** in `~/www/js/`, which is why `package.json` declares
  `"start": "node server.mjs"` (see the pitfall below).
- **`~/www/js/`** is the app directory (`/data/project/infobox-recommender/www/js`);
  a mirror of the repo also sits one level up. The process cwd is `www/js`, so
  its **`cache/`** (API responses) and **`usage/`** (usage log) live there.
  The platform's own `logs/` dir is for jobs/cron, not web access.
- Port comes from `PORT` (8000 in the pod). Static assets are read from disk per
  request, so `public/` changes take effect without a restart; **`server.mjs` and
  `lib/` changes need the restart**.
- Env knobs (all optional): `RATE_MAX`, `RATE_WINDOW_MS`, `BURST_MAX`,
  `BURST_WINDOW_MS`, `MAX_QUEUE`, `USAGE_DIR`, `EARLY_STOP`, `EARLY_STOP_MIN`,
  `TWO_AXIS` (the last: the two-axis decision is **default on since 2026-10-05** —
  coverage decides *whether*, dominance only advises *which*; set `TWO_AXIS=0` to
  revert to the legacy single verdict. Measured trade in
  `ARCHITECTURE.md#two-axis-decision-default-since-2026-10-05-two_axis0-reverts`)
  (the last two: opt-in census early stop — off by default, **keep the floor at
  100** if you turn it on; measured trade-off in `ARCHITECTURE.md#early_stop--census-less-when-more-cannot-help-opt-in`).

**Redeploy** (package → scp → extract into both copies → chown → restart):

```sh
# Local: uniquely named, private temp files — never fixed /tmp names (the bastion
# is multi-user; rule: ~/.pi/agent/AGENTS.md §"Shell arguments")
d=${TMPDIR:-/tmp}
pkg=$(mktemp "$d/ibr-XXXXXX")
tar czf "$pkg" --exclude=cache --exclude=usage --exclude=.git -C . .
deploy=$(mktemp "$d/ibr-deploy-XXXXXX")
cat > "$deploy" <<'EOF'
#!/bin/bash
set -eu
pkg="$1"
cd /data/project/infobox-recommender && tar xzf "$pkg"
cd www/js && tar xzf "$pkg"
chown -R tools.infobox-recommender: .
rm -f "$pkg"          # the payload temp is ours to clean up
webservice --backend=kubernetes node20 restart
EOF

# Remote: script over stdin (no remote script file); the payload temp is created
# BY the tool user, so it is unique and readable only by them — a 0600 file owned
# by alih would NOT be readable under sudo -niu
H=alih@dev.toolforge.org
r_pkg=$(ssh $H "sudo -niu tools.infobox-recommender mktemp /tmp/ibr-XXXXXX")
ssh $H "sudo -niu tools.infobox-recommender bash -c 'cat > $r_pkg'" < "$pkg"
ssh $H "sudo -niu tools.infobox-recommender bash -s $r_pkg" < "$deploy"
rm -f "$pkg" "$deploy"
```

**Verify a deploy** (all four, every time):

```sh
ssh alih@dev.toolforge.org "sudo -niu tools.infobox-recommender bash -lc \
  'webservice --backend=kubernetes node20 logs -l 5'"     # expect: > node server.mjs
curl -s -o /dev/null -w '%{http_code}\n' https://infobox-recommender.toolforge.org/
curl -s "https://infobox-recommender.toolforge.org/analyze?title=Abraham+Lincoln&output=json" | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' https://infobox-recommender.toolforge.org/stats
```

## 6. Debugging the deployment

| Symptom | First move |
|---|---|
| A **new route 404s** but other changes are live | The entry point, not your route. `webservice … logs -l 5` — if it shows `> node server.js`, see the pitfall below |
| Everything 502/503 | `webservice … status`; `kubectl --kubeconfig /data/project/infobox-recommender/.kube/config get pods` |
| A client gets 429 | Expected under load — the body names the limits and `Retry-After` says how long |
| 503 "busy" | Queue guard (≥`MAX_QUEUE` waiting). The upstream pacer (~1 req/s shared) is the real throughput ceiling |
| Analyses look slow | Cold vs cached: check `ls www/js/cache \| wc -l`; repeats are instant |
| "Why did usage change?" | `node scripts/usage-report.mjs --days 30 --titles` on the server (per-article detail stays server-side by design) |

Inspecting inside the pod (one command per exec — nested quoting breaks easily):

```sh
K=/data/project/infobox-recommender/.kube/config
ssh alih@dev.toolforge.org "sudo -niu tools.infobox-recommender bash -lc 'kubectl --kubeconfig $K get pods'"
ssh alih@dev.toolforge.org "sudo -niu tools.infobox-recommender bash -lc 'kubectl --kubeconfig $K exec <pod> -- pwd'"
```

## 7. Consumers of the JSON API (what breaks if you change things)

**Lead Balancer** — `User:Sadads/LeadBalancer-core.js` (engine of
`User:Sadads/Lead_Balancer`, installed by editors via `common.js`) shows an
infobox tab *only for articles that have no infobox*, calling
`GET /analyze?title=…&output=json` with a 20 s timeout, a 7-day client cache, and
retries that honour `Retry-After`.

Its parser (`normalizeAdvice`) reads **named keys only** — there is no nested or
synonym walk (an earlier version of this doc claimed "walks up to four levels
looking for synonym key names": verified false against the code 2026-10-05). What
it does means the practical contract is narrow and checkable:

| it reads | consequence for changes |
|---|---|
| `VERDICTS = [recommend, weak-signal, none-warranted, already-has-infobox, excluded]` via `VERDICTS.includes(json.verdict)` | an unknown verdict string collapses to `""` (no advice shown) — **never invent a verdict value** |
| `RECOMMEND = {recommend: true, 'none-warranted': false}` | every other verdict, including `weak-signal`, maps to `null` = "no call either way", so moving a case *to* weak-signal degrades to neutral rather than wrong |
| `json.template`, used **only when `verdict === 'recommend'`** | a recommendation with a weak/plurality template is surfaced as a suggested template — worth telling them when that starts happening |
| `json.confidence`, accepted only if `low`/`medium`/`high` | keep the vocabulary |
| `json.reason`, shown verbatim as the tab's summary, **clipped at 400 chars** | keep it self-contained: no pointers to this tool's own UI, and comfortably under the clip |
| evidence keys `total`, `withInfobox`, `distribution`, `boxedPeers`, `bare`, `bareCluster` | additive fields are ignored, so `dominanceShare`/`templateAdvice` are safe to add |

So: **additive JSON changes are safe; a change in which verdicts are emitted is
not a schema break but is a behaviour change in their UI** — announce it. If a
breaking change is ever needed, note it in the repo *and* on the script's talk
page first.

**Optional enhancement for their tab (dominant vs best candidate).** Since the
two-axis default can return `recommend` with a template that is only a *best
candidate*, the script currently presents every such suggestion as
"Suggested: {{X}}". Nothing breaks; the suggestion is just less qualified than
the tool's own report. The patch is two small edits in their source
(`api/infobox.js`), both optional — the field is additive, so ignoring it stays
safe:

```js
// 1) in normalizeAdvice(): carry the nuance
if (verdict === "recommend" && tplName(json.template)) {
  const adv = json.templateAdvice && typeof json.templateAdvice === "object" ? json.templateAdvice : null;
  const split = !!adv && adv.status === "split";
  const share = split && Number.isFinite(+adv.share) ? Math.round(adv.share * 100) : null;
  out.templates = [{ name: tplName(json.template), bestCandidate: split, share }];
}

// 2) at the render site, replace the `Suggested: …` fragment of `first`
const best = a.templates[0];
const suggestion = best
  ? best.bestCandidate
    ? ` Best candidate: ${tpl(best.name)}${best.share ? ` (${best.share}% of boxed peers)` : ""}` +
      ` — no single template dominates among peers.`
    : ` Suggested: ${a.templates.map((t) => tpl(t.name)).join(", ")}`
  : "";
```

With `TWO_AXIS=0` the engine returns no `templateAdvice`, `bestCandidate` is
`false`, and the tab renders exactly as it does today.

Rate limiting was widened for this client (2026-10-03): **150 analyses / 15 min
plus a 40/min burst, per client**, keyed on the proxy's `X-Forwarded-For` last
hop (`/stats` reports whether proxy headers are present). Before that the limit
was 30/5 min *shared by everyone* — it bucketed on the proxy address.

## 8. Hard-won lessons (do not re-learn these)

**API layer** — full list in `engineering-notes.md`. Short version: `tllimit` is
a per-request TOTAL (silent boundary truncation — hit again in a research script
2026-10-03); continuation is `tltitle` (single-prop) vs `tlcontinue`
(multi-prop); `prop=templates` returns literal names (normalize redirects) **and
reports templates used by transcluded templates** — the "phantom box" that
inflates census coverage (~1.4% of articles measured; ROADMAP 7b);
`prop=categories` has no hidden flag (`clshow=!hidden`); `wbgetclaims` is one
property per call; per-value SPARQL caches better than mixed `VALUES`; 4xx ≠
retryable.

**Operations:**

1. **`npm start` needs an explicit `start` script.** With none, npm runs its
   default `node server.js` *if that file exists* — and a stale `server.js` in
   `~/www/js/` shadowed `server.mjs` for weeks (Aug–Oct 2026). Symptom: new
   server routes 404 while `lib/`/`public/` fixes appear live, because the stale
   file imported the same `lib/` and served the same `public/`. Fixed by
   declaring `"start": "node server.mjs"`; the old file is parked as
   `~/www/js/server.js.stale-backup`. **Never rely on npm's implicit start.**
2. **Multi-layer `ssh` → `sudo` → `bash -c` collapses newlines.** A heredoc inside
   `bash -c '…'` arrives mangled (`set -ecd /data/…`). For anything longer than a single
   command, **pipe the script on stdin** (`ssh host "sudo -niu tools.<tool> bash -s <args…>"
   < script.sh`), and give every temp file a `mktemp` name — letting the *remote* create any
   file it must read (rule: `~/.pi/agent/AGENTS.md` §"Shell arguments").
3. **Verify with two independent signals before believing a claim.** The phantom
   box was only caught because the API's answer was cross-checked against
   wikitext; the entry-point bug was only caught because a new route 404'd while
   everything else looked healthy.
4. **Cache-first is also a debugging tool.** Grep `cache/` before theorising about
   a phantom regression (a stale cache once faked one).

## 9. Open threads

`ROADMAP.md` is the source of truth (two tracks: **engine** accuracy, **reach**
distribution). Currently next in line:

1. **Specificity ladder** — template-taxonomy walk (publisher ⊂ company,
   officeholder ⊂ person) to convert the remaining near-miss disagreements.
2. **Semantic sub-clustering** — LiftWing `outlink-topic-model` over the peer set; the
   main lever for the 25 abstains (`signals.md` H3).
3. **Stage D draft preview** — Wikidata fill-rate draft infobox (a *draft*, which
   enwiki norms allow, unlike the auto-rendered boxes rejected in 2018).
4. **Userscript / gadget** — the tool is already reached through an editor
   script; owning that experience is the highest-leverage reach item.
5. Smaller measured items: latency levers (category fan-out, adaptive early stop,
   peer cap — ROADMAP 7a), phantom-box coverage (7b), child-box auto-detection,
   per-element wrapper merge, backlog batch scanner, Diff writeup + a note at
   WikiProject Infoboxes `/assistance`.

## 10. Change log (ops + engine)

**Engine** (details and per-case deltas in `test/EVALUATION.md`):
census correctness → decision hardening → signal upgrades (categoryinfo,
shortdesc) → maintenance-category filter → primary-infobox selection → tiered
neighborhoods → Wikidata same-type pointers + canonical corpus → **subsidiary
section-box detection + unit tests** (2026-08-28). 11% → 90%.

**Ops / docs:**

| Date | Change |
|---|---|
| 2026-08-27 | First Toolforge deploy (k8s, node20, `~/www/js/`) |
| 2026-08-28 | Repo made public (MIT); corpus 87 → 88; unit tests added; README rewritten for newcomers + screenshots; About-modal and header-reset UI fixes |
| 2026-10-01 | Reviewed RfC-style need assessment (`status-quo.md`); public flip recorded |
| 2026-10-01 → 03 | Privacy-preserving usage logging + `/stats` + `PRIVACY.md`; early-usage/adoption report (`usage-history.md`); rate limits widened and made genuinely per-client; footer links `usage stats` / `privacy` |
| 2026-10-03 | README + HANDOFF refresh; entry-point pitfall documented |
| 2026-10-04 | Added `/random` (one-click analysis of a random infobox-request article) with a home-page 🎲 button; `lib/random-pick.js` + tests |
| 2026-10-04 | Performance audit + fixes: pacing made explicit and **per host** (was one global gate that let parallel calls burst), parallel census batches, 25-title census chain, one Wikidata request instead of seven, one WDQS query per pointer property instead of one per value, per-page cache that survives batch-shape changes. Cold runs: Canut revolts 20.4s → 6.6s, Abraham Lincoln 26.8s → 13.7s; eval unchanged at 57/6/25 |
| 2026-10-04 | Deploy recipe hardened: `mktemp` names instead of fixed `/tmp/ibr.tgz`, deploy script piped over stdin (no remote script file), payload temp created **by the tool user** so it is private yet readable under `sudo -niu` — verified by running it |
| 2026-10-05 | Peer-cap study (`scripts/research/peer-cap-study.mjs`, `test/results/peer-cap-study.json`): cap 150 kept; the decision is dominance-sensitive, not coverage-diluted. Implemented the census early stop it pointed at: `EARLY_STOP=1` (+ `EARLY_STOP_MIN`, default 100) — verdict-identical on the corpus, −6% peers censused; floor 25 costs 4 accuracy points (`test/results/early-stop-study.json`) |
| 2026-10-05 | Two-axis decision implemented, measured, then **made the default** (`TWO_AXIS=0` reverts): coverage decides *whether* an infobox is customary, dominance only advises *which* template (`templateAdvice`). Fixes a report that said "coverage 76% is in the ambiguous band" when the blocked gate was dominance. Measured (`test/results/two-axis-study.json`): whether-axis 94% of decisive with the same 2 failures, template advice 82% exact; 14 cases move from recommend → weak/mixed (dominant template kept as advice), 8 high-coverage abstentions become recommendations with a *best candidate*. Report card + About text rewritten for the two axes; `reason` strings made API-safe for the Lead Balancer script (no UI instructions, <380 chars) |

## 11. Working conventions

- **Cache-first:** warm eval runs are <1s. Bust `cache/` when API semantics
  change; grep cache JSONs before blaming code.
- **Verify against the live API** when numbers move — the corpus is a live wiki.
- **Keep `test/results/latest.*` committed**; that is the reproducibility record.
- **Two code copies exist** (repo root + Toolforge `www/js`) — redeploy after
  `lib/`/`server.mjs` changes, not just docs.
- **Never commit `cache/` or `usage/`** (both gitignored; `usage/` holds the
  privacy-preserving log).
- **Assert edits** rather than assuming an anchor matched (see the global
  guidelines) — a silent no-op replacement is the worst failure mode here.
- **Temp files use `mktemp`**, never a fixed `/tmp/name` — the bastion is multi-user, and
  a predictable `/tmp/foo.sh` is world-readable and collides with other runs. The rule
  (and the addressable traps) live in `~/.pi/agent/AGENTS.md` §"Shell arguments".
