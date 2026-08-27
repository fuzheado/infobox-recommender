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

// clickable template name -> Template: page
const tplLink = (name, cls = '') =>
  `<a class="tpl-link ${cls}" href="https://en.wikipedia.org/wiki/Template:${encodeURIComponent(name.replace(/ /g, '_'))}" target="_blank" rel="noopener">${esc(name)}</a>`;

const articleUrl = (title) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent((title ?? '').replace(/ /g, '_'))}`;

const qs = () => new URLSearchParams(location.search);

function setTitleParam(title) {
  const u = new URL(location.href);
  if (title) u.searchParams.set('title', title);
  else u.searchParams.delete('title');
  history.pushState({}, '', u.pathname + u.search);
}

const isValidate = () => qs().get('validate') === '1';

async function fetchAnalysis(title, validate) {
  const res = await fetch('analyze?title=' + encodeURIComponent(title) + (validate ? '&validate=1' : ''));
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

// Live progress via SSE; falls back to a plain fetch if the stream fails.
function streamAnalysis(title, validate, onStage) {
  return new Promise((resolve, reject) => {
    const es = new EventSource('analyze/stream?title=' + encodeURIComponent(title) + (validate ? '&validate=1' : ''));
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      es.close();
      fetchAnalysis(title, validate).then(resolve, reject); // stream unsupported — fall back
    }, 4000);
    es.addEventListener('stage', (e) => onStage(JSON.parse(e.data)));
    es.addEventListener('result', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      es.close();
      resolve(JSON.parse(e.data));
    });
    es.addEventListener('error', () => {
      if (settled) return;
      // EventSource retries automatically; only fall back if it never opens.
    });
  });
}

const panel = (title, html) =>
  `<section class="panel"><h3>${esc(title)}</h3>${html}</section>`;

// Article digest card: clickable title, short description, lead extract,
// thumbnail, infobox status, Wikidata statement presence — shown while the
// census runs and in the report. `wd` (optional) carries the post-discovery
// Wikidata contribution (usable classes, same-class peers).
function wdLine(d, wd) {
  const w = wd ?? d?.wikidata;
  if (!w) return '';
  let line = `Wikidata: ${w.qid ?? '—'} · P31 ×${w.p31} · P279 ×${w.p279}`;
  if (wd) {
    line +=
      w.classesTotal > 0
        ? ` · ${w.classesUsed}/${w.classesTotal} P31 classes usable · ${w.sparqlPeers} same-class peers`
        : ' · no P31 class on the item — categories carry the census';
  }
  return `<div class="digest-wd" id="wd-line">${esc(line)}</div>`;
}

function digestHtml(d, wd) {
  if (!d) return '';
  const thumb = d.thumbnail
    ? `<img class="digest-thumb" src="${esc(d.thumbnail)}" alt="" loading="lazy">`
    : '';
  const box =
    d.existingInfobox && d.existingInfobox !== 'Infobox'
      ? `<div class="digest-infobox">Has an infobox: ${tplLink(d.existingInfobox)}</div>`
      : `<div class="digest-infobox none">No infobox detected</div>`;
  const extract = d.extract
    ? `<p class="digest-extract">${esc(d.extract.length > 400 ? d.extract.slice(0, 400) + '…' : d.extract)}</p>`
    : '';
  return `<section class="panel digest">
    <div class="digest-head">${thumb}
      <div>
        <div class="digest-title"><a href="${articleUrl(d.title)}" target="_blank" rel="noopener">${esc(d.title)}</a></div>
        ${d.shortdesc ? `<div class="digest-desc">${esc(d.shortdesc)}</div>` : ''}
        ${box}
        ${wdLine(d, wd)}
      </div>
    </div>
    ${extract}
  </section>`;
}

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
            ${tplLink(t, 'dist-name')}
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
    rows.push(`<div class="sc-row"><span class="sc-label">Same-class (P31)</span><strong>${Math.round(sc.byClass.coverage * 100)}% boxed</strong> <span class="muted">n=${sc.byClass.n}${sc.byClass.dominant ? ' · dominant: ' + tplLink(sc.byClass.dominant.template) : ''}</span></div>`);
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
      ${boxed.map((p) => `<li><a href="${articleUrl(p.title)}" target="_blank" rel="noopener">${esc(p.title)}</a> ${tplLink(p.template)}</li>`).join('')}
    </ul></div>`);
  }
  if (bare.length) {
    sections.push(`<div><h4>Bare peers</h4><ul class="peer-list">
      ${bare.map((p) => `<li><a href="${articleUrl(p)}" target="_blank" rel="noopener">${esc(p)}</a></li>`).join('')}
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
  const cov = Math.round((ev.coverage ?? 0) * 100);
  const dom = ev.dominant;
  const domShare = dom ? Math.round((dom.count / (ev.withInfobox || 1)) * 100) : 0;
  if (few) {
    return `<p class="note weak-note">Only ${ev.total} evaluable peers — too few for a reliable census. The article's Wikidata class may be too broad or its categories too sparse.</p>`;
  }
  if (cov >= 50 && domShare < 50) {
    return `<p class="note weak-note">Most peers have an infobox, but no single template dominates (best candidate: ${tplLink(dom.template)} at ${domShare}% of boxed peers). The genre may be mixed — a WikiProject banner may point to the standardized infobox for this subject.</p>`;
  }
  return `<p class="note weak-note">Peer signals are mixed (coverage ${cov}% in the ambiguous band). The evidence below shows what exists; a WikiProject banner may point to the standardized infobox for this subject.</p>`;
}

// Comparison card (validate mode): the article already has an infobox and
// we ran the census to check the choice against peer practice.
function comparisonCard(c) {
  const cfg = {
    consistent: { cls: 'v-ok', title: 'The current infobox matches peer practice' },
    atypical: { cls: 'v-weak', title: 'Atypical choice — peers differ' },
    inconclusive: { cls: 'v-none', title: 'Inconclusive — peer evidence is mixed' },
  }[c.status] ?? { cls: 'v-info', title: c.status };
  const note = esc(c.note ?? '').replace(/\{\{([^}]+)\}\}/g, (_, n) => tplLink(n));
  return `<div class="verdict ${cfg.cls}">
    <div class="verdict-title">${cfg.title}</div>
    <div class="verdict-reason">${note}</div>
  </div>`;
}

function renderReport(r) {
  const ev = r.evidence ?? {};
  let cardClass, verdictTitle, badge = '';
  switch (r.verdict) {
    case 'recommend':
      cardClass = 'v-ok';
      verdictTitle = `Recommend: ${tplLink(r.template)}`;
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
      verdictTitle = `Already has an infobox${r.template ? ` (${tplLink(r.template)})` : ''}`;
      break;
    case 'excluded':
      cardClass = 'v-info';
      verdictTitle = `Excluded — ${esc(r.reason ?? '')}`;
      break;
    default:
      cardClass = 'v-err';
      verdictTitle = `Error — ${esc(r.reason ?? '')}`;
  }

  const articleLink = articleUrl(r.title ?? '');
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

  // validate mode: the comparison card replaces the plain verdict card
  const verdictHtml = r.comparison ? comparisonCard(r.comparison) : `
    <div class="verdict ${cardClass}">
      <div class="verdict-title">${verdictTitle} ${badge}</div>
      <div class="verdict-reason">${esc(r.reason ?? '')}</div>
      ${weakSignalNote(r, ev)}
    </div>`;

  $view.innerHTML = `
    <div class="report">
      ${digestHtml(r.digest, r.wikidata)}
      ${verdictHtml}
      ${evidenceHtml}
      <section class="panel actions">
        <h3>Report</h3>
        <div class="action-row">
          <a href="${articleLink}" target="_blank" rel="noopener">View article</a>
          <a href="${talkLink}" target="_blank" rel="noopener">Talk page</a>
          ${r.verdict === 'already-has-infobox' ? '<button id="validate-btn">Run peer census to check this choice</button>' : ''}
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
  document.getElementById('validate-btn')?.addEventListener('click', () => {
    const u = new URL(location.href);
    u.searchParams.set('validate', '1');
    history.pushState({}, '', u.pathname + u.search);
    run(r.title, true);
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
      <p class="muted" id="elapsed">First analysis takes ~5–30s depending on peer-set size. Repeat analyses are instant.</p>
      <div id="digest"></div>
      <div class="progress-panel" id="progress">
        <div class="stage" data-stage="resolve"><span class="dot"></span>Resolving article</div>
        <div class="stage" data-stage="peers"><span class="dot"></span>Discovering peers (Wikidata class, categories, WikiProject banners)</div>
        <div class="stage" data-stage="census"><span class="dot"></span>Peer infobox census <span class="census-count"></span></div>
        <div class="stage" data-stage="clusters"><span class="dot"></span>Sub-cluster analysis</div>
        <div class="stage" data-stage="decide"><span class="dot"></span>Decision</div>
      </div>
    </div>`;

  const started = Date.now();
  if (elapsedTimer) clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => {
    const el = document.getElementById('elapsed');
    if (el) el.textContent = `Elapsed: ${Math.round((Date.now() - started) / 1000)}s — live progress below.`;
  }, 1000);

  onStageRef = (ev) => {
    if (ev.stage === 'digest') {
      // article digest lands right after resolution — render it while the
      // census runs (clickable title, short description, lead extract)
      const slot = document.getElementById('digest');
      if (slot) slot.innerHTML = digestHtml(ev);
      return;
    }
    if (ev.stage === 'wikidata') {
      // post-discovery contribution: update the digest's Wikidata line
      const el = document.getElementById('wd-line');
      if (el) el.innerHTML = wdLine(null, ev);
      return;
    }
    const row = document.querySelector(`.stage[data-stage="${ev.stage}"]`);
    if (row) {
      if (ev.stage === 'census' && typeof ev.done === 'number') {
        const count = row.querySelector('.census-count');
        if (count) count.textContent = `— ${ev.done} of ${ev.total} peers`;
      }
      if (ev.stage === 'peers' && ev.label === 'Peer set ready') {
        const note = document.createElement('span');
        note.className = 'stage-note';
        note.textContent = `— ${ev.sparql ?? 0} same-class, ${ev.category ?? 0} category peers`;
        row.appendChild(note);
      }
    }
    for (const r of document.querySelectorAll('.stage')) r.classList.remove('active');
    const cur = document.querySelector(`.stage[data-stage="${ev.stage}"]`);
    if (cur) cur.classList.add('active');
  };
}

let onStageRef = null;
let elapsedTimer = null;

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

async function run(title, validate) {
  setTitleParam(title);
  if (!validate) {
    const u = new URL(location.href);
    u.searchParams.delete('validate');
    history.replaceState({}, '', u.pathname + u.search);
  }
  renderLoading(title);
  try {
    const r = await streamAnalysis(title, validate, (ev) => onStageRef?.(ev));
    clearInterval(elapsedTimer);
    renderReport(r);
  } catch (e) {
    clearInterval(elapsedTimer);
    renderError(title, e.message);
  }
}

$form.addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $input.value.trim();
  if (t) run(t, false);
});
window.addEventListener('popstate', () => {
  const t = qs().get('title');
  if (t) {
    $input.value = t;
    run(t, isValidate());
  } else {
    $input.value = '';
    renderHome();
  }
});

const initial = qs().get('title');
if (initial) {
  $input.value = initial;
  run(initial, isValidate());
} else {
  renderHome();
}

// --- About modal ---
const $about = document.getElementById('about-modal');
const openAbout = () => {
  $about.hidden = false;
  document.body.classList.add('modal-open');
};
const closeAbout = () => {
  $about.hidden = true;
  document.body.classList.remove('modal-open');
  history.replaceState(null, '', location.pathname + location.search);
};
document.getElementById('about-close')?.addEventListener('click', closeAbout);
$about?.addEventListener('click', (e) => {
  if (e.target === $about) closeAbout(); // click on the backdrop
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$about.hidden) closeAbout();
});
window.addEventListener('hashchange', () => {
  if (location.hash === '#about') openAbout();
});
if (location.hash === '#about') openAbout();
// first visit: open the About box once so new users see the method
if (!localStorage.getItem('infobox-recommender-about-seen')) {
  localStorage.setItem('infobox-recommender-about-seen', '1');
  openAbout();
}
