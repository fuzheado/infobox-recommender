// lib/stats-page.js — server-rendered /stats page.
//
// Everything interpolated here can be influenced by outsiders (referrer
// hosts come from the Referer header; template names come from wiki content),
// so every value is HTML-escaped.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const num = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—');

function bars(obj, { limit = 12, tone = '' } = {}) {
  const rows = Object.entries(obj ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (!rows.length) return '<p class="muted">No data yet.</p>';
  const max = rows[0][1] || 1;
  return `<div class="bars">${rows
    .map(
      ([k, v]) => `<div class="row">
        <span class="k">${esc(k)}</span>
        <span class="bar"><i class="${tone}" style="width:${Math.max(2, Math.round((v / max) * 100))}%"></i></span>
        <span class="v">${num(v)}</span>
      </div>`
    )
    .join('')}</div>`;
}

function months(obj) {
  const rows = Object.entries(obj ?? {}).sort();
  if (!rows.length) return '<p class="muted">No data yet.</p>';
  const max = Math.max(...rows.map(([, v]) => v)) || 1;
  return `<div class="bars">${rows
    .map(
      ([k, v]) => `<div class="row">
        <span class="k">${esc(k)}</span>
        <span class="bar"><i class="ok" style="width:${Math.max(2, Math.round((v / max) * 100))}%"></i></span>
        <span class="v">${num(v)}</span>
      </div>`
    )
    .join('')}</div>`;
}

export function renderStatsPage(snap) {
  const a = snap.allTime ?? {};
  const r = snap.retainedWindow ?? {};
  const ret = snap.retention ?? {};
  const avg = a.avgElapsedMs ? `${(a.avgElapsedMs / 1000).toFixed(1)}s` : '—';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Usage — infobox recommender</title>
<style>
  :root { --fg:#202122; --muted:#72777d; --border:#c8ccd1; --bg:#f8f9fa; --link:#3366cc;
          --ok:#14866d; --none:#b32424; --weak:#ac6600; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
         font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  header { background:#fff; border-bottom:1px solid var(--border); padding:18px 16px; text-align:center; }
  header h1 { margin:0 0 4px; font-size:22px; }
  header p { margin:0; color:var(--muted); font-size:13px; }
  main { max-width:860px; margin:0 auto; padding:16px; }
  section { background:#fff; border:1px solid var(--border); border-radius:8px; padding:14px 16px; margin-bottom:14px; }
  h2 { font-size:15px; margin:0 0 10px; }
  h3 { font-size:13px; margin:14px 0 6px; color:var(--muted); text-transform:uppercase; letter-spacing:.03em; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(135px,1fr)); gap:10px; }
  .card { background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:10px; text-align:center; }
  .card b { display:block; font-size:21px; }
  .card span { color:var(--muted); font-size:12px; }
  .bars .row { display:grid; grid-template-columns:minmax(120px,1.3fr) 2fr 48px; gap:8px; align-items:center; margin-bottom:4px; }
  .bars .k { font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .bars .bar { background:var(--bg); border:1px solid var(--border); border-radius:3px; height:12px; }
  .bars .bar i { display:block; height:100%; background:#36c; border-radius:2px; }
  .bars .bar i.ok { background:var(--ok); }
  .bars .v { text-align:right; font-size:13px; color:var(--muted); }
  .muted { color:var(--muted); }
  .small { font-size:13px; }
  ul { margin:6px 0; padding-left:20px; }
  code { background:var(--bg); padding:1px 4px; border-radius:3px; font-size:13px; }
  a { color:var(--link); }
  footer { text-align:center; color:var(--muted); font-size:12px; padding:8px 16px 24px; }
</style>
</head><body>
<header>
  <h1>Usage</h1>
  <p>Infobox recommender — aggregate, privacy-preserving statistics</p>
</header>
<main>
  <section>
    <h2>Summary</h2>
    <div class="cards">
      <div class="card"><b>${num(a.analyses)}</b><span>analyses (all time)</span></div>
      <div class="card"><b>${num((a.analyses ?? 0) + (a.validations ?? 0))}</b><span>incl. validations</span></div>
      <div class="card"><b>${num(r.distinctArticles)}</b><span>distinct articles (${num(r.days)}d)</span></div>
      <div class="card"><b>${num(a.pageLoads)}</b><span>page loads</span></div>
      <div class="card"><b>${avg}</b><span>avg analysis time</span></div>
      <div class="card"><b>${num(a.errors)}</b><span>errors</span></div>
    </div>
    <p class="muted small" style="margin:10px 0 0">
      Window: ${esc((a.firstRecordedAt ?? '').slice(0, 10) || '—')} → ${esc((a.lastRecordedAt ?? '').slice(0, 10) || '—')} UTC
      · ${num(snap.cachedApiResponses)} cached API responses (${num(snap.cacheMb)} MB)
    </p>
  </section>

  <section>
    <h2>Verdicts</h2>
    ${bars(snap.verdicts)}
  </section>

  <section>
    <h2>Templates recommended</h2>
    ${bars(snap.templates, { tone: 'ok' })}
  </section>

  <section>
    <h2>Analyses per month</h2>
    ${months(snap.byMonth)}
    <p class="muted small">Month granularity only — day-level patterns are not published.</p>
  </section>

  <section>
    <h2>Where visitors come from</h2>
    ${bars(snap.referrers)}
    <p class="muted small">Referrer <em>host</em> only (e.g. <code>en.wikipedia.org</code>); full referrer URLs are never stored.</p>
  </section>

  <section>
    <h2>How analyses were requested</h2>
    ${bars(snap.sources)}
  </section>

  <section>
    <h2>Privacy &amp; data retention</h2>
    <p class="small">This tool follows Wikimedia's privacy and data-retention guidance, and collects the minimum
    needed to answer "is this tool used, and how?".</p>
    <h3>Not collected</h3>
    <ul class="small">${(ret.notCollected ?? []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <h3>Retention</h3>
    <ul class="small">
      <li>Per-analysis records (which article was analysed, when): <strong>${esc(ret.rawPerAnalysisRecords ?? '')}</strong>.</li>
      <li>Aggregates (this page): <strong>${esc(ret.aggregates ?? '')}</strong> — no titles, no day-level detail.</li>
    </ul>
    <p class="small muted">Stats are aggregate only. Public tooling shows counts — never the list of analyses,
    and never anything about who ran them.</p>
  </section>

  <section>
    <h2>Raw data</h2>
    <p class="small">Machine-readable version of this page: <a href="/stats?output=json"><code>/stats?output=json</code></a>
    (CORS-enabled). Source and methodology:
    <a href="https://github.com/fuzheado/infobox-recommender">github.com/fuzheado/infobox-recommender</a> ·
    <a href="https://github.com/fuzheado/infobox-recommender/blob/main/PRIVACY.md">PRIVACY.md</a>.</p>
  </section>
</main>
<footer>Generated ${esc(snap.generatedAt)} · infobox-recommender</footer>
</body></html>`;
}
