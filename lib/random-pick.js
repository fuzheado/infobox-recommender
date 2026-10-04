// lib/random-pick.js — pick a random article from the infobox-request backlog.
//
// The {{Infobox requested}} tag lives on TALK pages, so a member of
// Category:Wikipedia articles with an infobox request is "Talk:Some article".
// These helpers turn that list into analysable article titles and choose one,
// avoiding recent repeats. Pure functions (rng injected) so they can be tested.

/** "Talk:Some article" -> "Some article"; non-article talk pages -> null. */
export function articleFromTalkTitle(title) {
  if (typeof title !== 'string') return null;
  const t = title.replace(/^Talk:/, '').trim();
  if (!t) return null;
  // Talk:Template:X, Talk:Category:X, Talk:Wikipedia:X … are not articles
  if (t.includes(':')) return null;
  // the tool cannot say anything useful about a bare list page
  if (/^(List|Lists|Timeline|Outline|Index) of/i.test(t)) return null;
  return t;
}

/**
 * @param {string[]} members raw category members (Talk:… titles)
 * @param {{recent?: string[], rng?: () => number}} [opts]
 * @returns {string|null} an article title, or null when nothing is pickable
 */
export function pickRandomArticle(members, { recent = [], rng = Math.random } = {}) {
  const all = [...new Set((members ?? []).map(articleFromTalkTitle).filter(Boolean))];
  if (!all.length) return null;
  const seen = new Set(recent);
  const fresh = all.filter((t) => !seen.has(t));
  const pool = fresh.length ? fresh : all; // everything is "recent": allow repeats
  const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[i] ?? null;
}
