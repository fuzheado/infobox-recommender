# Research scripts: localized infobox template naming

Pipeline behind [`infobox-naming.md`](../../infobox-naming.md) and
[`infobox-naming.json`](../../infobox-naming.json): how infobox templates are named
across 20 Wikipedia language editions, and what share of them a naive English
`title starts with "Infobox"` rule would catch.

## Why

`lib/census.js` identifies infoboxes by the literal prefix `Infobox` plus seven
hardcoded families. Measured against each wiki's own declared infobox set, that
rule matches **58.3%** of 13,082 sampled templates overall — and near-zero on
several large editions (es 2.0%, it 0.9%, ar 4.9%, ko 0.3%, ru/tr/he 0.0%).
The failure mode is silent: a missed family lowers measured coverage, which
flips the verdict toward a confident "no infobox customary".

## Run

Needs only the Python standard library (no `requests`, no third-party packages).
Every request sends a descriptive User-Agent and pauses ~1s between calls.

```bash
export INFOBOX_WORKDIR=.          # where JSON artifacts are read/written; default: cwd

python3 scripts/research/infobox_step1_sitelinks.py   # -> infobox_qid_sitelinks.json
python3 scripts/research/infobox_step2_harvest.py     # -> infobox_raw.json  (API-heavy)
python3 scripts/research/infobox_step3_analyze.py     # -> infobox-naming.json + infobox-naming.md
```

Step 2 is the slow one (~430 requests, roughly 10-15 minutes at 1s pacing) and
is resumable: it rewrites `infobox_raw.json` after every wiki, and a re-run
keeps wikis already marked `ok`. HTTP 429/503 are retried with exponential
backoff and counted, never treated as zero.

## Method

1. **Step 1** — `action=query&prop=pageprops&titles=Category:Infobox_templates`
   on enwiki gives the Wikidata item (**Q6154820**); `wbgetentities&props=sitelinks`
   then yields the localized category title per wiki (233 sitelinks).
2. **Step 2** — for each wiki, `list=categorymembers` (combined `cmtype=page|subcat`)
   restricted to **namespace 10 (Template)**: the localized category itself plus
   its direct subcategories (depth ≤ 2), capped at 30 subcategories and 1500
   members per wiki. The local Template-namespace name (`Vorlage`, `Modèle`,
   `Шаблон`, `틀`, `Bản mẫu`, …) comes from `siteinfo`.
   Lua/Module (ns 828), Help (ns 12), project (ns 4) and article (ns 0) pages that
   some wikis file in the same category are **excluded from the counts** and
   reported separately.
3. **Step 3** — per edition: total sampled, naive-rule hits and share, the
   dominant local infobox word and whether it sits in prefix or suffix position,
   the best *localized* prefix rule, the most common other leading words, and
   three verbatim example titles.

## Headline results

| | |
|---|---|
| editions measured | 20 |
| templates sampled (ns 10) | 13,082 |
| caught by naive `^Infobox` | 7,630 (**58.3%**) |
| containing any localized infobox word | 10,150 (77.6%) |

Position matters as much as vocabulary: **pl** has `infobox` in 98.7% of titles
but only 39 as a prefix vs 246 as a suffix (`Aktor infobox`), and **tr**/**ko**
put their infobox word at the end (`… bilgi kutusu`, `… 정보`) — so a
prefix-anchored rule fails on them regardless of how good the word list is.

## Caveats

- Some "infobox" categories are container categories with mixed contents
  (it samples 268 distinct leading words across 337 templates).
- Editions with more than 30 direct subcategories were read to that depth-2 cap.
- Category membership is editor-maintained: an infobox template filed elsewhere
  is invisible to this method. It measures the wiki's *declared* set.
