# Early usage history — the first ~70 analyses (2026-08-27 → 2026-10-02)

**Why this document exists:** for its first five weeks the deployed service had
no application logging, so this is the only record of who used the tool and
what happened next. It was reconstructed from the server's API cache (see
*Method*) and is kept deliberately: it is the project's first real-world
evidence, and the baseline the new `/stats` counter starts from.

> **Headline numbers.** **70 analyses** of **70 distinct articles** over 37 days.
> **62 were infobox-less at analysis time** (the tool's remit); 8 already had
> one (mostly the maintainer's own tests). **2 confirmed infobox additions**
> followed, both with named editors. **0 of the 47 articles analysed by outside
> users** have gained an infobox yet. **1 census detection artifact** surfaced
> (see *Phantom boxes*), and it is a real (small) accuracy risk for the tool.

---

## Where the traffic came from

Not search, not the README — **the tool is embedded in a popular user script.**

`User:Sadads/LeadBalancer-core.js` (the engine behind
[User:Sadads/Lead Balancer](https://en.wikipedia.org/wiki/User:Sadads/Lead_Balancer),
a lead-section review script editors install via `common.js`) contains:

```js
// ---- Infobox check (article tab, only when the article has no infobox) ----
// Asks https://infobox-recommender.toolforge.org (CORS-enabled, no tokens).
// Its evidence is advisory (MOS:INFOBOXUSE); an editor makes the call.
infobox: { enabled: true, timeoutMs: 2e4, cacheDays: 7 },
```

```js
var INFOBOX_SERVICE = "https://infobox-recommender.toolforge.org";
var reportUrl  = (title) => `${INFOBOX_SERVICE}/?title=${encodeURIComponent(title)}`;
var analyzeUrl = (title) => `${INFOBOX_SERVICE}/analyze?title=${encodeURIComponent(title)}&output=json`;
```

So each call is `GET /analyze?title=…&output=json`, made **only for articles
that have no infobox**, with a 20-second timeout and a 7-day client cache. That
explains the traffic shape exactly: bursts of infobox-less articles inside one
topic area, minutes apart — a reviewer working through a subject.

Discovery of this reference: an `insource:"infobox-recommender"` search across
all namespaces returns exactly one page, that script.

**Caveat on attribution.** The integration is proven, but individual analyses
cannot be attributed: no referrer or client data was recorded in this era, and
some of the 70 are certainly the maintainer's own tests (all of 2026-08-27/28,
plus later checks matching the repo's own examples and fixtures).

## Method

The server caches every Wikimedia API response as `SHA1(url).json` (gitignored
`cache/`). Each analysed article leaves a REST-summary entry naming it, so
grouping those entries by title and reading their mtimes reconstructs the
inventory. For each article:

| Question | How it was answered |
|---|---|
| Did it have an infobox **at analysis time**? | Revision current at the analysis timestamp (`rvstart`/`rvdir=older`), wikitext scanned for infobox-family templates (same family list Lead Balancer gates on) |
| Does it have one **now**? | `prop=templates` (canonicalised) **cross-checked against the article wikitext** |
| If gained: who, when, which template? | First revision in the window containing an infobox-family template |

**Not recoverable:** the verdict the tool returned at the time (results are not
cached, only inputs), who ran each analysis, or whether it came from the HTML
page or the JSON API.

**One more caveat discovered later (2026-10-03):** the throttle in force
during this window bucketed clients on `socket.remoteAddress`, which behind
Toolforge's proxy is *the proxy* — so the 30-analyses-per-5-minutes cap was
effectively **global**, shared by every visitor. Some intended analyses may
never have run (they would have returned 429). The limiter now keys on the
proxy's `X-Forwarded-For` last hop, verified live. Everything here is a *reconstruction* from API-cache
artifacts plus live wiki history — reproducible, but not a log.

## The analyses

Twenty on 2026-08-27/28 are the maintainer's development runs (the tool was
being built and deployed that week). The remaining fifty, from 2026-09-04
onward, are outside use — sessions clustering by topic, which is the
Lead Balancer signature.

| Date (UTC) | Session |
|---|---|
| 2026-08-27 → 08-28 | maintainer development & deploy verification (20 analyses) |
| 2026-09-04 | single article (*Dolly Parton as a gay icon*) |
| 2026-09-25 (5 min) | Panama law-enforcement / Belize geography cluster (6) |
| 2026-09-26 | *Secular equilibrium* (a README example) |
| 2026-09-30 (01:09–02:00) | *Dog*, *Prince-elector*, *1346 imperial election* — repo examples/fixtures (maintainer checks) |
| 2026-09-30 (15:48–17:43) | energy & heavy-industry cluster (18) |
| 2026-09-30 (21:38) → 10-01 (02:53) | infrastructure / water / geology (7) |
| 2026-10-01 (08:53–19:24) | misc. articles (4) |
| 2026-10-02 (01:13–02:01) | climate-justice cluster (8) |

The full per-article inventory:

| Analysed (UTC) | Article | State |
|---|---|---|
| 2026-08-27 12:02 | Small-signal model | bare |
| 2026-08-27 12:02 | Hugh Aston | bare |
| 2026-08-27 12:03 | 1845 Royal Canal disaster | **gained** `{{Infobox event}}` — Hoof Hearted, 2026-09-25 |
| 2026-08-27 12:26 | May 1400 imperial election | **gained** `{{Infobox election}}` — TheDeredzh, 2026-10-02 |
| 2026-08-27 12:27 | Dallas Cowboys | had `{{Infobox NFL team}}` |
| 2026-08-27 12:31 | Paul Grimley | bare |
| 2026-08-27 12:41 | France | had `{{Infobox country}}` |
| 2026-08-27 13:51 | Abraham Lincoln | had `{{Infobox officeholder}}` |
| 2026-08-27 14:07 | Blue Lagoon (geothermal spa) | had `{{Infobox settlement}}` |
| 2026-08-27 14:29 | Golgi apparatus | bare |
| 2026-08-27 14:33 | Endomembrane system | bare |
| 2026-08-27 14:56 | DNA repair | bare |
| 2026-08-27 14:59 | Microturbine | bare |
| 2026-08-27 15:16 | Column chromatography | bare |
| 2026-08-28 00:11 | Felix Greissle | had `{{Infobox musical artist}}` |
| 2026-08-28 00:17 | Canut revolts | bare |
| 2026-08-28 01:17 | Geneviève Zubrzycki | bare |
| 2026-08-28 01:18 | Icelandic College of Art and Crafts | bare |
| 2026-08-28 01:22 | Bovine somatotropin | bare |
| 2026-08-28 04:26 | Institute of Governmental Studies | bare |
| 2026-09-04 02:36 | Dolly Parton as a gay icon | bare |
| 2026-09-25 17:23 | Law enforcement in Panama | bare |
| 2026-09-25 17:24 | National Police Intelligence Directorate | bare |
| 2026-09-25 17:25 | South Stann Creek | bare |
| 2026-09-25 17:27 | Sittee River | bare |
| 2026-09-25 17:30 | Monkey River | bare |
| 2026-09-25 17:31 | Charley Boswell | bare |
| 2026-09-26 21:18 | Secular equilibrium | bare |
| 2026-09-30 01:09 | Dog | had `{{Speciesbox}}` |
| 2026-09-30 01:10 | Prince-elector | bare |
| 2026-09-30 02:00 | 1346 imperial election | had `{{Infobox election}}` |
| 2026-09-30 15:48 | History of Rome | bare |
| 2026-09-30 15:49 | Religion in Rome | bare |
| 2026-09-30 15:54 | Blast furnace | bare |
| 2026-09-30 15:58 | AI data center | bare |
| 2026-09-30 16:07 | Heat pump | bare |
| 2026-09-30 16:08 | Global catastrophic risk | bare |
| 2026-09-30 16:17 | Red meat | bare |
| 2026-09-30 16:18 | Steelmaking | bare |
| 2026-09-30 16:21 | Geothermal energy | bare |
| 2026-09-30 16:25 | Induction heating | bare |
| 2026-09-30 16:26 | Electric energy consumption | bare |
| 2026-09-30 16:27 | Gasoline | bare |
| 2026-09-30 16:29 | Automotive industry | bare |
| 2026-09-30 16:32 | Potash | bare |
| 2026-09-30 17:04 | Weir | bare |
| 2026-09-30 17:21 | National syndicalism | bare |
| 2026-09-30 17:22 | Carbon footprint | bare |
| 2026-09-30 17:24 | Beaver dam | bare |
| 2026-09-30 17:42 | Zuiderzee Works | bare |
| 2026-09-30 17:43 | Banqiao Dam | bare |
| 2026-09-30 21:38 | Upland and lowland | bare |
| 2026-10-01 00:23 | Glacial lake outburst flood | bare |
| 2026-10-01 01:08 | The Right Honourable | bare |
| 2026-10-01 02:11 | Trace fossil | bare |
| 2026-10-01 02:14 | Cat | had `{{Speciesbox}}` |
| 2026-10-01 02:15 | List of sovereign states | bare |
| 2026-10-01 02:53 | Flora Vano | bare |
| 2026-10-01 08:53 | Lamb and mutton | bare |
| 2026-10-01 08:54 | Highest temperature recorded on Earth | bare |
| 2026-10-01 08:56 | La Folletteism | bare |
| 2026-10-01 19:24 | SUV | bare |
| 2026-10-02 01:13 | Just transition | bare |
| 2026-10-02 01:14 | Ecocide | bare |
| 2026-10-02 01:29 | Environmental racism | bare |
| 2026-10-02 01:30 | Climate justice | bare |
| 2026-10-02 01:32 | Climate resilience | bare |
| 2026-10-02 01:33 | Kodaikanal mercury poisoning | bare |
| 2026-10-02 01:33 | Politics of air conditioning | bare |
| 2026-10-02 02:01 | Dies irae | bare |

## Adoption: did anyone act on it?

Two articles that had **no infobox when analysed** have one now, both added by
named editors:

| Article | Analysed | Infobox added | By | When | Edit summary |
|---|---|---|---|---|---|
| 1845 Royal Canal disaster | 2026-08-27 | `{{Infobox event}}` | Hoof Hearted | 2026-09-25 19:26 | `+requested infobox` |
| May 1400 imperial election | 2026-08-27 | `{{Infobox election}}` | TheDeredzh | 2026-10-02 12:43 | *(none)* |

Read honestly:

- **`May 1400 imperial election` is the strongest signal.** It is one of this
  project's own demo cases (claimed to recommend `{{Infobox election}}` at high
  confidence, 30/30 class-boxed), the article was bare for weeks after
  analysis, and an editor added exactly that template. Correlation, not proof —
  but the article had no `{{Infobox requested}}` tag driving it.
- **`1845 Royal Canal disaster` is weaker as evidence for the tool.** The edit
  summary `+requested infobox` indicates the editor was responding to a
  maintenance tag on the article (exactly the workflow `status-quo.md`
  documents), not necessarily to a peer census.
- **Neither was an outside user.** Both articles were analysed during the
  maintainer's development window (Aug 27), not in the external Sep 4 → Oct 2
  sessions.
- **0 of the 47 externally-analysed bare articles** have gained an infobox as of
  2026-10-03. The oldest of those is ~4 weeks old; the median is ~3 days. This
  is a *baseline to watch*, not a verdict on usefulness: the Lead Balancer tab
  is advisory, the edit is the editor's to make, and on-wiki work moves slowly.

## Phantom boxes: a census artifact worth knowing about

One apparent third gain — *Golgi apparatus* — turned out to be a **detection
artifact**, and chasing it found a real (if small) flaw in how the census
decides a peer is boxed.

- `prop=templates` on *Golgi apparatus* reports `Template:Infobox` — but the
  article's wikitext contains **no** infobox at all (not even the string).
- Cause: the article transcludes `{{Cell biology}}`, and `Template:Cell biology`
  *itself* uses `{{Infobox}}`. MediaWiki's `prop=templates` reports templates
  used by transcluded templates, not just direct transclusions.
- Audited across all 70 articles: `prop=templates` claimed a box for 11,
  wikitext confirmed 10 → **1 phantom (≈1.4% of articles, ≈9% of "boxed"
  verdicts)**. No misses in the other direction.

Implication: `lib/census.js` counts coverage from `prop=templates`, so a peer
whose page merely *transcludes a template that internally uses Infobox* is
counted as boxed. At this rate that is a small coverage inflation, not a
verdict-changer — but it is now measured, and the fix (verify boxed-ness from
wikitext, or treat a box as confirmed only when the article itself invokes it)
is noted in `ROADMAP.md`.

## Method notes worth keeping

- **The `tllimit` trap bit again.** The first pass at "current state" used
  50-title `prop=templates` batches; `tllimit` is a per-request **total**, so
  the check silently truncated and reported one article as still bare when the
  article plainly had an infobox. `engineering-notes.md` warns about exactly
  this; the audit scripts now use small batches **plus** `tlcontinue`.
- **Prefer two independent signals for a claim of existence.** The phantom box
  was only caught because the API answer was cross-checked against wikitext.

## What this means for the project

1. **Distribution came from an integration, not from the front door.** The
   README, the search UI and the backlog link produced far less traffic than an
   embed in someone's editor script — the "reach" thesis in `ROADMAP.md`, in
   one data point: **build the userscript**.
2. **Adoption measurement now exists in two forms**: this retrospective
   baseline (cache + wiki history) and the going-forward log
   (`/stats`, `scripts/usage-report.mjs --adoption`), which records the verdict
   alongside the title so future adoption checks are exact rather than inferred.
3. **Rate limits were widened (2026-10-03).** Lead Balancer users can work a
   topic cluster faster than the old 30-analyses-per-5-minutes cap allowed; a
   429 shows up as a failed tab. The limit is now **150 analyses / 15 min plus
   a 40/min burst per client** — with a cross-IP queue guard (503 + Retry-After)
   and proxy-aware client identification, so widening the per-client budget did
   not weaken flood protection. See `ARCHITECTURE.md#web-service`.
4. **Coverage counting has a known ~1% phantom rate** from transitive
   `prop=templates`.

## Reproducing

```sh
# 1. inventory from the server cache (run on Toolforge, as the tool user)
python3 scripts/research/extract-cache-inventory.py > /tmp/inventory.json

# 2. per-article state at analysis time, now, and any addition since
node scripts/research/adoption-analysis.mjs /tmp/inventory.json > /tmp/adoption.json

# 3. prop=templates vs wikitext phantom audit
node scripts/research/phantom-box-check.mjs /tmp/inventory.json > /tmp/phantom.json

# 4. merge into the committed dataset
node scripts/research/build-usage-history.mjs /tmp/inventory.json /tmp/adoption.json /tmp/phantom.json usage-history.json
```

The scripts pace at ≥1s per request and cache responses (`cache/`), so a repeat
run is cheap. Committed data: `usage-history.json` (per-article rows, counts,
adoption and phantom details).

## Limits of this document

- Reconstruction, not a log: no verdicts, no client type, no per-user identity.
- Adoption is *correlation with a wiki edit*: editors may act for their own
  reasons (the Royal Canal edit says so in its summary), and slow work may
  simply not have happened yet.
- Author attribution of an edit is to the wiki account, which says nothing
  about whether a tool was consulted.
