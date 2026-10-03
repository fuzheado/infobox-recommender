# Privacy & data retention — infobox-recommender

This tool collects the **minimum** needed to answer one question: *is it used,
and how well does it work?* It follows Wikimedia's
[Data Retention Guidelines](https://meta.wikimedia.org/wiki/Data_retention_guidelines)
and the [Cloud Services privacy policy](https://wikitech.wikimedia.org/wiki/Help:Toolforge/Rules).

## What is collected

One small record per analysis (appended to a monthly JSONL file on Toolforge
NFS):

| Field | Example | Why |
|---|---|---|
| timestamp | `2026-10-02T10:00:00Z` | usage over time |
| kind / source | `analyze` / `stream` | HTML, SSE, or JSON API |
| article title | `May 1400 imperial election` | which articles needed this; enables adoption tracking |
| verdict, template, confidence | `recommend`, `Infobox election`, `high` | is the tool being useful / right? |
| peer count, coverage | `61`, `0.75` | evidence-size context |
| duration | `1200` ms | performance |
| referrer **host** | `en.wikipedia.org` | where visitors arrive from |

## What is *not* collected

- **IP addresses** — never read, never stored. (Toolforge's own web-service
  logs contain IPs; they are platform-level, access-restricted, and neither
  read nor republished by this tool.)
- **User-Agent strings**, cookies, session identifiers, account names.
- **Full referrer URLs** — only the host survives; paths and query strings
  can carry watchlists, search terms, or tokens and are discarded on arrival.
- Any record of *who* ran an analysis — the tool cannot attribute usage to a
  person, by design.

Fields are assembled from an explicit allowlist (`lib/usage.js`), so an
unexpected header cannot leak into the log. Enforcement is covered by tests
(`test/usage.test.mjs`) that assert stored records contain no IP, UA, cookie,
or full-referrer fields.

## Retention

| Data | Retention | Rationale |
|---|---|---|
| Raw per-analysis records (the table above) | **90 days**, pruned automatically at startup and daily | user-identifiable in the weak sense that they show which article someone looked at |
| Aggregates served at `/stats` (counts, month buckets, verdict/template/referrer-host tallies) | **indefinite** | counts only — no titles, no timestamps finer than a month, nobody identifiable |

When a raw file ages out, the all-time counts remain but the detail is gone.

## What is published

`/stats` is public and aggregate-only. It **never** lists article titles, and
**never** shows day-level granularity — day-level activity can reveal an
individual's working pattern (a documented deanonymization risk), so daily
breakdowns stay server-side for the maintainer. Per-title detail is available
only to the tool maintainer, on the Toolforge host, within the 90-day window.

## Deletion requests

Because no identifiers are stored, there is nothing to look up by user. If you
want a specific analysis removed from the raw log before it ages out (for
example, it names an article you would rather not have in a usage record),
contact the maintainer (Andrew Lih, per [LICENSE](LICENSE)) or open an issue at
<https://github.com/fuzheado/infobox-recommender/issues>, and the matching
line(s) will be deleted.

## Implementation

- `lib/usage.js` — allowlist filtering, host-only referrers, monthly rotation,
  90-day pruning, counts-only aggregates
- `lib/stats-page.js` — the public `/stats` HTML (all values escaped)
- `server.mjs` — records one line per analysis/page load; `/stats` endpoint
- `test/usage.test.mjs` — privacy and retention assertions
- `scripts/usage-report.mjs` — maintainer-only report (per-day counts and
  per-article detail) run on the Toolforge host
