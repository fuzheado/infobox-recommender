// lib/rate-limit.js — per-client throttling for the web service.
//
// Goals, in order:
//   1. Never get in a real editor's way. Lead Balancer (the user script that
//      calls this service) walks articles in a topic cluster, so bursts of
//      dozens of analyses in a few minutes are *normal*, not abusive.
//   2. Bound the damage a runaway script or a flood can do. The upstream
//      Wikimedia API is already paced globally (≥1s between request starts),
//      so throughput is inherently capped; these guards keep queues and memory
//      from growing without limit and give clients an honest Retry-After.
//
// Two sliding windows per client: a generous sustained rate and a smaller
// burst rate. Both must pass.

/** Identify the client behind the Toolforge nginx proxy.
 *
 * `socket.remoteAddress` is the *proxy*, so every visitor would share one
 * bucket without this. X-Forwarded-For is client-controllable, so only the
 * LAST entry (appended by our own trusted proxy) is trusted; X-Real-IP is the
 * proxy's own header. Falls back to the socket address when neither exists
 * (local dev).
 */
export function clientIp(headers = {}, remoteAddress = null) {
  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last.slice(0, 64);
  }
  const real = headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim().slice(0, 64);
  return remoteAddress ?? 'unknown';
}

/**
 * Sliding-window limiter.
 *
 * @param {object} opts
 * @param {Array<{max:number, windowMs:number}>} opts.rules  sustained windows
 * @param {Array<{max:number, windowMs:number}>} opts.burst  short-term windows
 * @returns {{check(ip):{allowed:boolean,retryAfterSec:number,rule?:string}, prune():number, size():number}}
 */
export function createRateLimiter({
  rules = [{ max: 150, windowMs: 15 * 60 * 1000 }],
  burst = [{ max: 40, windowMs: 60 * 1000 }],
  now = () => Date.now(),
} = {}) {
  const all = [...rules, ...burst].sort((a, b) => b.windowMs - a.windowMs);
  const longest = all[0]?.windowMs ?? 0;
  /** @type {Map<string, number[]>} ip -> ascending hit timestamps */
  const hits = new Map();

  function check(ip) {
    const t = now();
    // keep only what any window could still care about
    const arr = (hits.get(ip) ?? []).filter((x) => t - x < longest);

    for (const rule of all) {
      const recent = arr.filter((x) => t - x < rule.windowMs);
      if (recent.length >= rule.max) {
        // how long until enough of this window ages out to admit one more
        const idx = recent.length - rule.max; // entry that must expire first
        const retryAfterSec = Math.max(1, Math.ceil((recent[idx] + rule.windowMs - t) / 1000));
        hits.set(ip, arr);
        return { allowed: false, retryAfterSec, rule: `${rule.max}/${Math.round(rule.windowMs / 1000)}s` };
      }
    }

    arr.push(t);
    hits.set(ip, arr);
    return { allowed: true, retryAfterSec: 0 };
  }

  /** Drop clients with no hits inside the longest window. */
  function prune() {
    const t = now();
    let removed = 0;
    for (const [ip, arr] of hits) {
      const kept = arr.filter((x) => t - x < longest);
      if (kept.length === 0) {
        hits.delete(ip);
        removed++;
      } else if (kept.length !== arr.length) {
        hits.set(ip, kept);
      }
    }
    return removed;
  }

  return { check, prune, size: () => hits.size };
}

/** Human-readable summary of the configured limits (for logs / /stats). */
export const describeLimits = ({ rules = [], burst = [] } = {}) =>
  [...rules, ...burst]
    .map((r) => `${r.max} per ${Math.round(r.windowMs / 1000)}s`)
    .join(' + ');
