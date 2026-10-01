# Research scripts: localized infobox template naming

Pipeline behind [`infobox-naming.md`](../../infobox-naming.md) and
[`infobox-naming.json`](../../infobox-naming.json): how infobox templates are named
across 20 Wikipedia language editions, and what share of them a naive English
`title starts with "Infobox"` rule would catch.

## Why

`lib/census.js` identifies infoboxes by the literal prefix `Infobox` plus seven
hardcoded families. Measured against each wiki's own declared infobox set, that
rule matches **60.2%** of 13,724 sampled templates overall — and near-zero on
several large editions (es 2.0%, it 0.9%, ar 4.9%, ko 0.3%, ru/tr/he 0.0%), and
under half on 12 of the 20 editions.
The failure mode is silent: a missed family lowers measured coverage, which
flips the verdict toward a confident "no infobox customary".

## Run

Needs only the Python standard library (no `requests`, no third-party packages).
Every request sends a descriptive User-Agent and pauses ~1s between calls.

```bash
export INFOBOX_WORKDIR=.          # where JSON artifacts are read/written; default: cwd

python3 scripts/research/infobox_step1_sitelinks.py   # -> infobox_qid_sitelinks.json
python3 scripts/research/infobox_step2_harvest.py     # -> infobox_raw.json  (API-heavy)
python3 scripts/research/infobox_step4_crosscheck.py  # -> infobox-crosscheck.json (~40 requests)
python3 scripts/research/infobox_step3_analyze.py     # -> infobox-naming.json + infobox-naming.md
```

Step 3 runs last so that Table 5 can include the cross-check; if
`infobox-crosscheck.json` is absent it simply omits that table and produces
everything else.

Step 2 is the slow one (~470 requests, roughly 10-15 minutes at 1s pacing) and
is resumable: it rewrites `infobox_raw.json` after every wiki, and a re-run
keeps wikis already marked `ok`. HTTP 429/503 are retried with exponential
backoff and counted, never treated as zero.

## Method

1. **Step 1** — `action=query&prop=pageprops&titles=Category:Infobox_templates`
   on enwiki gives the Wikidata item (**Q6154820**); `wbgetentities&props=sitelinks`
   then yields the localized category title per wiki (233 sitelinks).
2. **Step 2** — for each wiki, `list=categorymembers` restricted to **namespace 10
   (Template)**: the localized category itself plus up to 30 of its direct
   subcategories (depth ≤ 2). Pages and subcategories are requested with
   **separate `cmtype` calls** so that a large ns-10 listing cannot consume the
   member cap and hide the subcategory list (that bug once dropped enwiki's 19
   subcategories entirely). The local Template-namespace name (`Vorlage`,
   `Modèle`, `Шаблон`, `틀`, `Bản mẫu`, …) comes from `siteinfo`.
   Lua/Module (ns 828), Help (ns 12), project (ns 4) and article (ns 0) pages that
   some wikis file in the same category are **excluded from the counts** and
   reported separately.
3. **Step 4** — independent cross-check. `list=search` `intitle:` totals over the
   wiki's whole Template namespace (namespace 10) for the English word versus the
   local word. This reads the CirrusSearch index, not category membership, so it
   is a second method with a different denominator. It reproduces Table 2 of
   `wikiprojects-and-i18n.md` and fills that table's gaps (en was rate-limited;
   he/ar/ko/tr/vi had no local-word column). The two methods can disagree in
   direction — svwiki has more `Infobox*` titles namespace-wide, but `Faktamall`
   leads inside its declared infobox set — and the md says so.
4. **Step 3** (run last) — per edition: total sampled, naive-rule hits and share,
   the dominant local infobox word and whether it sits in prefix or suffix
   position, the best *localized* prefix rule, the most common other leading
   words, three verbatim example titles, and Table 5 from step 4 if present.

## Headline results

| | |
|---|---|
| editions measured | 20 |
| templates sampled (ns 10) | 13,724 |
| caught by naive `^Infobox` | 8,257 (**60.2%**) |
| containing any localized infobox word | 10,771 (78.5%) |

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
