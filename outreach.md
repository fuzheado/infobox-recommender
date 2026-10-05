# Where to announce infobox-recommender

Research notes for outreach (compiled 2026-10-05). Every venue below was checked
**live** — last-edit timestamp via the MediaWiki API, or an HTTP status for the
non-wiki ones — because a post in a dormant forum is worse than no post, and
"active" is a fact about the page, not about my memory of it. Re-check the dates
before acting; they are the point.

Related: `ROADMAP.md` Tier 3 (visibility), `status-quo.md` §8 (the demand
argument and the Microtask Generator recommendation).

## The pitch, in one line

The community has asked for this **three times** — the
[2017 wishlist "Infobox wizard"](https://meta.wikimedia.org/wiki/2017_Community_Wishlist_Survey/Editing/Infobox_wizard)
(#5, 106 votes), [2023 "Quickly add infobox"](https://meta.wikimedia.org/wiki/Community_Wishlist_Survey_2023/Editing/Quickly_add_infobox),
and the current [Community Wishlist **W3** "Quickly Add Infobox"](https://meta.wikimedia.org/wiki/Community_Wishlist/W3)
(closed `status=done`) — and **what shipped each time was insertion**: templates
by name (TemplateWizard), a template finder (WMDE Technical Wishes), the
Microtask Generator's "find similar articles to copy template structure".
Insertion was solved; **selection was not** — *which* box, and why. That is the
whole job of this tool, and it is the honest way to describe it anywhere below.

## Tier 1 — highest relevance, low risk

1. **`Wikipedia talk:WikiProject Infoboxes`** — *live (last edit 2026-09-24)*.
   The maintainers' hub; the natural first post.
   - Where: a **new L2 section** (the page has only 6 sections, all specific
     template/RfC threads, so a new one does not bury anything).
   - Timing note: that page currently carries **MOS:INFOBOXUSE RfC** activity.
     Announce the tool and its evidence; do **not** argue policy with it.
2. **Toolhub** — the canonical catalogue of Wikimedia tools, and **this tool is
   not in it** (`/api/tools/?name=infobox` → 0 results;
   `/api/tools/infobox-recommender/` → 404). Registration is a few minutes' work
   and is the one item here that keeps working after the announcement scrolls
   away. There are three supported routes
   ([Toolhub on Meta](https://meta.wikimedia.org/wiki/Toolhub)), all needing a
   Wikimedia login; the API answers at `/api-docs`:
   - **This tool is on Toolforge, so the cheap path first:** create the record in
     [toolsadmin](https://toolsadmin.wikimedia.org) — Toolhub (and Hay's
     Directory) import Toolforge toolinfo records automatically.
   - **Or register a `toolinfo.json` with the crawler:**
     <https://toolhub.wikimedia.org/add-or-remove-tools?tab=urls>. The file is
     drafted at [`toolinfo.json`](toolinfo.json) in this repo (validated against
     the toolinfo **1.2.2** schema — five deliberate errors were rejected by the
     same validator, so the check discriminates); register the raw URL
     `https://raw.githubusercontent.com/fuzheado/infobox-recommender/main/toolinfo.json`
     and the crawler re-checks it about hourly. Keeping it in the repo (as
     CitationHunt and Adiutor do) is what lets volunteers PR corrections.
   - **Or create the record in the UI:**
     <https://toolhub.wikimedia.org/add-or-remove-tools?tab=tool-create>, or
     `POST /api/tools/` with an OAuth token.
   - ⚠️ **Do not use `/tools/create`.** That is the *detail page of an existing
     tool named “create”* (a spam record, author “Smadur1997”) — not a creation
     form. Verified in a browser 2026-10-05: the page title is
     “Tool : ‪create‬ | Toolhub”, and `/api/tools/create/` returns that tool's
     record. A URL status check cannot tell these apart: Toolhub's HTML is a
     1.3 KB JavaScript shell, so every client-side route answers 200 (and the
     *look* of it — `/tools` 404s while `/tools/create` 200s — is not evidence
     either).
3. **`Help talk:Infobox`** — *live (last edit 2026-08-23)*. `Help:Infobox`
   documents exactly two methods (browse ~2,000 templates; copy from a similar
   article) and this tool automates the second while producing the MOS:INFOBOXUSE
   evidence the page already cites. Ask for a third bullet, with the eval numbers
   — a content proposal needing consensus, not an ad.
4. **Microtask Generator / Growth team** — [T360489 "Offer edit suggestions as a
   service"](https://phabricator.wikimedia.org/T360489) (the epic behind the
   generator) and [T362579](https://phabricator.wikimedia.org/T362579) (URL-triggered
   suggested edits). Their "add an infobox" task ends at *"find similar articles"*,
   and their own Diff post invited feedback. The handoff is a link in the shape
   they already use: `https://infobox-recommender.toolforge.org/?title=<article>`
   answers with `verdict` / `template` / `confidence` / `evidence`.
   This is the highest-leverage item on the list and it is a conversation, not an
   announcement.
5. **Do not reopen the wishlist wish.** W3 is closed as done; cite it (with the
   2017 and 2023 ones) as demand evidence *inside* the other posts instead.

## Tier 2 — broad reach, has to be done carefully

6. **`Wikipedia:Village pump`** — all live daily (technical 2026-10-05,
   miscellaneous 2026-10-05, proposals 2026-10-04). Post **once**, in the pump
   that matches the angle: *technical* for the API/tooling/eval story, *misc* for
   the editor-facing "which infobox?" story. **Proposals is for concrete
   proposals with significant impact — a tool notice does not qualify.** Never
   cross-post the same text.
7. **Project talk pages where the backlog actually sits** — every one of these is
   live: Military history (2026-10-05), Biography (2026-10-04), Food and drink
   (2026-10-05), Plants (2026-10-02), Manual of Style/Infoboxes (2026-09-12).
   A post that names *their* stale `{{Infobox requested}}` articles and gives the
   evidence per article will be read; a general advertisement will not. One
   project at a time, days apart.
8. **The Signpost** — suggest, don't write: `Wikipedia:Wikipedia
   Signpost/Newsroom/Suggestions` (*live 2026-09-26*; the page also lists a
   private email tip to the editors). Frame: "community tool, measured eval
   (88 cases, 90% on decisive verdicts), addresses a wish the community filed
   three times". The now-inactive `Signpost/Newsroom` page (2025-09) is *not* the
   submission route.
9. **`Wikidata:Project chat`** (live daily) and **`Wikidata:Status updates/Next`**
   (the weekly summary, live 2026-10-05) — the same-type-pointer machinery
   (P39/P179/P361/P155/P156) is Wikidata's, and a line in the weekly summary is a
   low-key way to reach the people who maintain it.

## Tier 3 — reach outside the editing community (traffic, not adoption)

10. Wikimedia Community Discord ([~7,000 members](https://discord.com/invite/wikipedia),
    with dedicated Commons/Meta/Wikidata/enwiki channels), Telegram
    [@WikimediaAnnouncements](https://t.me/WikimediaAnnouncements) (purpose-built
    for this) and @WikimediaGeneral, Wikidata/enwiki IRC channels, the Fediverse
    (`#Wikipedia`, `#Wikimedia`), Reddit `r/wikipedia` / `r/Wikidata`, and a
    `Show HN`.
    - Honest caveat: these reach readers and generalists. Expect traffic spikes
      with little editorial follow-through, and a spike that is *not* visible in
      `/stats` referrers is worth understanding before repeating it.

## Don't bother

- **`Template talk:Infobox requested`** — last non-bot edit 2024-10.
- **`Wikipedia:WikiProject Infoboxes/assistance`** — its talk page's last edit is
  **2019-11-13**; the parent project's talk page is the live venue now.
- **`Wikipedia:Announcements`** — last edited 2022-03-22.
- **Mass-messaging WikiProject members or individual editors** — canvassing, and
  unnecessary: the project talk pages reach the same people legitimately.
- **Same-day multi-venue blasts** — one venue, then read the response, then the
  next. The failure mode is being read as promotion in five places at once.

## Suggested sequence

| When | Where | Ask |
|---|---|---|
| Day 1 | `Wikipedia talk:WikiProject Infoboxes` | "Built this; here is the eval; feedback welcome" |
| Day 1 | Toolhub `/tools/create` | registration (durable discovery) |
| Day 3–4 | `Help talk:Infobox` | add a third method, citing the eval |
| Day 5–7 | Microtask Generator (T360489) / Growth | per-article handoff link |
| Week 2 | Village pump (technical *or* misc, once) | the engine/eval story |
| Week 2 | `Signpost/Newsroom/Suggestions` | a tip, not an article |
| Week 3 | Project talk pages, one at a time | "your N stale requests, with evidence" |

Measure with `/stats` (analyses, referrer hosts, verdict mix) and
`node scripts/usage-report.mjs --days 30 --adoption` — traffic is not adoption,
and the adoption rate is the number that matters (ROADMAP §8).

## Draft — WikiProject Infoboxes / Village pump (short form)

> **A peer-census answer to "which infobox?"** — I built a tool that takes the
> article's own neighbourhood instead of guessing from the article: it finds peers
> (Wikidata P31 classes, same-type pointers like position held / part of the
> series / preceded-by, and the article's most specific categories), censuses what
> infoboxes they actually use, and reports the template, the coverage, the
> distribution and the example peers — or abstains honestly when the evidence is
> mixed. It never edits.
>
> It exists because the community asked three times (2017 wishlist "Infobox
> wizard" #5; 2023 "Quickly add infobox"; the current (closed) Community Wishlist
> W3) and what shipped was *insertion* — TemplateWizard, the WMDE template finder,
> and the Microtask Generator's "find similar articles" — rather than *selection*.
>
> Evaluated on 88 labelled cases: 57 pass / 6 near-miss or defensible
> disagreements / 25 abstentions — 90% on decisive verdicts.
> <https://infobox-recommender.toolforge.org> · `/stats` for usage ·
> <https://github.com/fuzheado/infobox-recommender> (MIT) · feedback very welcome,
> especially cases where the verdict is wrong.
