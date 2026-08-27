// app.js — client-side renderer for the infobox recommender.
// Reads ?title= from the URL, fetches /analyze?title=… (JSON), renders the
// report. No dependencies.

const $view = document.getElementById('view');
const $form = document.getElementById('search');
const $input = document.getElementById('title');

const EXAMPLES = [
  ['1346 imperial election', 'recommend — high confidence'],
  ['May 1400 imperial election', 'recommend — high confidence'],
  ['Secular equilibrium', 'no infobox customary'],
  ['Small-signal model', 'weak signal — too few peers'],
  ['Prince-elector', 'weak signal — concept genre'],
];

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const qs = () => new URLSearchParams(location.search);

function setTitleParam(title) {
  const u = new URL(location.href);
  if (title) u.searchParams.set('title', title);
  else u.searchParams.delete('title');
  history.pushState({}, '', u.pathname + u.search);
}

async function fetchAnalysis(title) {
  const res = await fetch('analyze?title=' + encodeURIComponent(title));
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

const panel = (title, html) =>
  `<section class="panel"><h3>${esc(title)}</h3>${html}</section>`;

function coverageBar(ev) {
  const cov = Math.round((ev.coverage ?? 0) * 100);
  const boxed = ev.withInfobox ?? Math.round((ev.coverage ?? 0) * (ev.total ?? 0));
  const fill = Math.min(100, cov);
  const tone = cov >= 50 ? 'ok' : cov <= 25 ? 'none' : 'weak';
  return panel('Peer census', `
    <div class="census">
      <div class="coverage-label">${boxed} of ${ev.total ?? 0} peer articles have an infobox — <strong>${cov}%</strong></div>
      <div class="bar"><div class="fill ${tone}" style="width:${fill}%"></div></div>
    </div>`);
}

function distributionPanel(ev) {
  const dist = Object.entries(ev.distribution ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!dist.length) return '';
  const max = dist[0][1];
  return panel('Template distribution among boxed peers', `
    <div class="dist">
      ${dist
        .map(
          ([t, n]) => `<div class="dist-row">
            <span class="dist-name" title="${esc(t)}">${esc(t)}</span>
            <div class="bar"><div class="fill" style="width:${Math.round((n / max) * 100)}%"></div></div>
            <span class="dist-n">${n}</span>
          </div>`
        )
        .join('')}
    </div>`);
}

function subClusterPanel(ev) {
  const sc = ev.subCluster ?? {};
  const rows = [];
  if (sc.byClass) {
    rows.push(`<div class="sc-row"><span class="sc-label">Same-class (P31)</span><strong>${Math.round(sc.byClass.coverage * 100)}% boxed</strong> <span class="muted">n=${sc.byClass.n}${sc.byClass.dominant ? ' · dominant: ' + esc(sc.byClass.dominant.template) : ''}</span></div>`);
  }
  if (sc.byCategoryOnly) {
    rows.push(`<div class="sc-row"><span class="sc-label">Category-only</span><strong>${Math.round(sc.byCategoryOnly.coverage * 100)}% boxed</strong> <span class="muted">n=${sc.byCategoryOnly.n}</span></div>`);
  }
  if (!rows.length) return '';
  return panel('Sub-cluster split', rows.join(''));
}

const chips = (items, label) =>
  items && items.length
    ? `<div class="chips">${items.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>`
    : `<p class="muted">${label}</p>`;

function clustersPanel(ev) {
  const bc = ev.bareCluster ?? [];
  if (!bc.length) return '';
  return panel('Bare-peer sub-clusters (shared categories)', bc
    .map(
      (c) => `<div class="cluster-row"><a class="cat" href="https://en.wikipedia.org/wiki/Category:${encodeURIComponent(c.category.replace(/ /g, '_'))}" target="_blank" rel="noopener">Category:${esc(c.category)}</a> <span class="chip">${c.n} bare peers</span></div>`
    )
    .join(''));
}

function peerSamplesPanel(ev) {
  const boxed = ev.boxedPeers ?? [];
  const bare = ev.bare ?? [];
  const sections = [];
  if (boxed.length) {
    sections.push(`<div><h4>Boxed peers</h4><ul class="peer-list">
      ${boxed.map((p) => `<li><a href="https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}" target="_blank" rel="noopener">${esc(p.title)}</a> <span class="tpl">${esc(p.template)}</span></li>`).join('')}
    </ul></div>`);
  }
  if (bare.length) {
    sections.push(`<div><h4>Bare peers</h4><ul class="peer-list">
      ${bare.map((p) => `<li><a href="https://en.wikipedia.org/wiki/${encodeURIComponent(p.replace(/ /g, '_'))}" target="_blank" rel="noopener">${esc(p)}</a></li>`).join('')}
    </ul></div>`);
  }
  return sections.length ? panel('Peer samples', sections.join('')) : '';
}

function skippedNote(ev) {
  const sk = ev.skipped ?? [];
  if (!sk.length) return '';
  const byWhy = {};
  for (const s of sk) byWhy[s.why] = (byWhy[s.why] ?? 0) + 1;
  const parts = Object.entries(byWhy).map(([w, n]) => `${n} ${w}`);
  return `<p class="muted small">${sk.length} peers excluded from the census (${parts.join(', ')})</p>`;
}

function weakSignalNote(r, ev) {
  if (r.verdict !== 'weak-signal') return '';
  const few = (ev.total ?? 0) < 5;
  return `<p class="note weak-note">${few
    ? `Only ${ev.total} evaluable peers — too few for a reliable census. The article's Wikidata class may be too broad or its categories too sparse.`
    : `Peer signals are mixed (coverage in the ambiguous band, ${Math.round((ev.coverage ?? 0) * 100)}%). The evidence below shows what exists; a WikiProject banner may point to the standardized infobox for this subject.`}</p>`;
}

function renderReport(r) {
  const ev = r.evidence ?? {};
  let cardClass, verdictTitle, badge = '';
  switch (r.verdict) {
    case 'recommend':
      cardClass = 'v-ok';
      verdictTitle = `Recommend: ${esc(r.template)}`;
      badge = `<span class="badge">confidence: ${esc(r.confidence ?? '—')}</span>`;
      break;
    case 'none-warranted':
      cardClass = 'v-none';
      verdictTitle = 'No infobox customary';
      badge = `<span class="badge">confidence: ${esc(r.confidence ?? '—')}</span>`;
      break;
    case 'weak-signal':
      cardClass = 'v-weak';
      verdictTitle = 'Weak signal — no confident recommendation';
      badge = `<span class="badge">${esc(r.confidence ?? '')}</span>`;
      break;
    case 'already-has-infobox':
      cardClass = 'v-info';
      verdictTitle = `Already has an infobox${r.template ? ` (${esc(r.template)})` : ''}`;
      break;
    case 'excluded':
      cardClass = 'v-info';
      verdictTitle = `Excluded — ${esc(r.reason ?? '')}`;
      break;
    default:
      cardClass = 'v-err';
      verdictTitle = `Error — ${esc(r.reason ?? '')}`;
  }

  const articleLink = `https://en.wikipedia.org/wiki/${encodeURIComponent((r.title ?? '').replace(/ /g, '_'))}`;
  const talkLink = `https://en.wikipedia.org/wiki/Talk:${encodeURIComponent((r.title ?? '').replace(/ /g, '_'))}`;

  let evidenceHtml = '';
  if (r.verdict === 'recommend' || r.verdict === 'none-warranted' || r.verdict === 'weak-signal') {
    evidenceHtml = `
      ${coverageBar(ev)}
      ${distributionPanel(ev)}
      ${subClusterPanel(ev)}
      ${clustersPanel(ev)}
      ${ev.banners && ev.banners.length ? panel('WikiProject banners', chips(ev.banners, 'none')) : ''}
      ${peerSamplesPanel(ev)}
      ${skippedNote(ev)}`;
  }

  $view.innerHTML = `
    <div class="report">
      <div class="verdict ${cardClass}">
        <div class="verdict-title">${verdictTitle} ${badge}</div>
        <div class="verdict-reason">${esc(r.reason ?? '')}</div>
        ${weakSignalNote(r, ev)}
      </div>
      ${evidenceHtml}
      <section class="panel actions">
        <h3>Report</h3>
        <div class="action-row">
          <a href="${articleLink}" target="_blank" rel="noopener">View article</a>
          <a href="${talkLink}" target="_blank" rel="noopener">Talk page</a>
          <button id="copy-json">Copy JSON</button>
          <button id="share">Share link</button>
        </div>
      </section>
    </div>`;

  document.getElementById('copy-json').addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(r, null, 2)).then(
      () => { flash('JSON copied'); },
      () => { flash('Copy failed'); }
    );
  });
  document.getElementById('share').addEventListener('click', () => {
    navigator.clipboard.writeText(location.href).then(
      () => { flash('Link copied'); },
      () => { flash('Copy failed'); }
    );
  });
}

function flash(msg) {
  const el = document.createElement('div');
  el.className = 'flash';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

function renderLoading(title) {
  $view.innerHTML = `
    <div class="report loading">
      <div class="spinner"></div>
      <h2>Running the peer census for “${esc(title)}”…</h2>
      <p class="muted">First analysis of an article takes 30–90s (Wikidata queries). Repeat analyses are instant.</p>
    </div>`;
}

function renderError(title, msg) {
  $view.innerHTML = `
    <div class="report">
      <div class="verdict v-err">
        <div class="verdict-title">Could not analyze “${esc(title)}”</div>
        <div class="verdict-reason">${esc(msg)}</div>
      </div>
      <section class="panel actions"><button id="retry">Try again</button></section>
    </div>`;
  document.getElementById('retry').addEventListener('click', () => run(title));
}

function renderHome() {
  $view.innerHTML = `
    <section class="panel intro">
      <p>For a Wikipedia article without an infobox, this tool runs a <strong>census over its peers</strong> —
      articles of the same Wikidata class and category — and reports what infobox practice looks like there:</p>
      <ul class="intro-list">
        <li><strong>Recommend</strong> a specific template when a strong majority of same-class peers use it (with evidence)</li>
        <li><strong>No infobox customary</strong> when peers are overwhelmingly bare</li>
        <li><strong>Weak signal</strong> when the evidence is mixed — abstention instead of guessing</li>
      </ul>
    </section>
    <section class="panel">
      <h3>Try an example</h3>
      <ul class="examples">
        ${EXAMPLES.map(([t, d]) => `<li><a href="?title=${encodeURIComponent(t)}">${esc(t)}</a> <span class="muted">— ${esc(d)}</span></li>`).join('')}
      </ul>
    </section>
    <section class="panel">
      <h3>API</h3>
      <p class="muted small"><code>GET /analyze?title=ARTICLE&amp;output=json</code> — the full analysis as JSON, CORS-enabled.
      HTML report: <code>/?title=ARTICLE</code>. Evidence is advisory (MOS:INFOBOXUSE); an editor makes the call.</p>
    </section>`;
}

async function run(title) {
  setTitleParam(title);
  renderLoading(title);
  try {
    const r = await fetchAnalysis(title);
    renderReport(r);
  } catch (e) {
    renderError(title, e.message);
  }
}

$form.addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $input.value.trim();
  if (t) run(t);
});
window.addEventListener('popstate', () => {
  const t = qs().get('title');
  if (t) {
    $input.value = t;
    run(t);
  } else {
    $input.value = '';
    renderHome();
  }
});

const initial = qs().get('title');
if (initial) {
  $input.value = initial;
  run(initial);
} else {
  renderHome();
}
