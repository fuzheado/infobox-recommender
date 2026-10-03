// Unit tests for the per-client rate limiter (lib/rate-limit.js).
//
// The policy being locked in: generous for real editors (bursts of dozens of
// analyses are normal for a Lead Balancer session), bounded for abuse, and an
// honest Retry-After when someone is over the line.
//
// Run: node --test test/rate-limit.test.mjs   (or: npm test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, clientIp } from '../lib/rate-limit.js';

const mk = (opts = {}) => {
  let t = 0;
  const limiter = createRateLimiter({
    rules: [{ max: 150, windowMs: 15 * 60_000 }],
    burst: [{ max: 40, windowMs: 60_000 }],
    now: () => t,
    ...opts,
  });
  return { limiter, advance: (ms) => (t += ms), at: () => t };
};

test('clientIp trusts only the last X-Forwarded-For hop (spoof-resistant)', () => {
  // A client that forges XFF: the proxy appends the real address last.
  assert.equal(clientIp({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }), '203.0.113.7');
  assert.equal(clientIp({ 'x-forwarded-for': '203.0.113.7' }), '203.0.113.7');
  assert.equal(clientIp({ 'x-real-ip': '198.51.100.9' }), '198.51.100.9');
  assert.equal(clientIp({}, '10.0.0.5'), '10.0.0.5'); // local dev fallback
  assert.equal(clientIp({}, null), 'unknown');
  assert.equal(clientIp({ 'x-forwarded-for': '  ,  ' }, '10.0.0.5'), '10.0.0.5');
});

test('a normal Lead Balancer session is never blocked', () => {
  const { limiter, advance } = mk();
  // 50 analyses spaced 6s apart = 50 inside 5 minutes. This is the case the
  // old 30-per-5-minutes cap would have rejected; it must now pass, and stay
  // inside the burst window (10 per 60s <= 25) and the sustained one
  // (50 per 15min <= 150).
  for (let i = 0; i < 50; i++) {
    assert.equal(limiter.check('editor').allowed, true, `#${i + 1}`);
    advance(6_000);
  }
});

test('a tighter session (10s apart for an hour) stays under the sustained cap', () => {
  const { limiter, advance } = mk();
  let allowed = 0;
  for (let i = 0; i < 360; i++) {
    if (limiter.check('marathon').allowed) allowed++;
    advance(10_000);
  }
  // ~10/min of wall-clock use over an hour: generous, but not unbounded
  assert.ok(allowed >= 300, `expected most of an hour's browsing to pass, got ${allowed}`);
});

test('the burst window catches a tight loop even under the sustained cap', () => {
  const { limiter, advance } = mk();
  for (let i = 0; i < 40; i++) assert.equal(limiter.check('looper').allowed, true, `burst #${i + 1}`);
  const blocked = limiter.check('looper');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.rule, '40/60s');
  assert.ok(blocked.retryAfterSec >= 1 && blocked.retryAfterSec <= 60);

  // one minute later, allowed again (and still inside the sustained window)
  advance(60_000);
  assert.equal(limiter.check('looper').allowed, true);
});

test('the sustained window stops a long-running flood and reports Retry-After', () => {
  const { limiter, advance } = mk({ burst: [] });
  for (let i = 0; i < 150; i++) {
    assert.equal(limiter.check('flooder').allowed, true);
    advance(1000); // 1/sec for 150s — under any sane burst rule
  }
  const blocked = limiter.check('flooder');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.rule, '150/900s');
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 900);

  advance(15 * 60_000);
  assert.equal(limiter.check('flooder').allowed, true);
});

test('buckets are per client — one abusive IP does not throttle others', () => {
  const { limiter } = mk({ burst: [{ max: 2, windowMs: 60_000 }] });
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, false);
  // a different client is untouched
  assert.equal(limiter.check('b').allowed, true);
  assert.equal(limiter.check('b').allowed, true);
});

test('prune() drops idle clients so the map cannot grow without bound', () => {
  const { limiter, advance } = mk();
  for (const ip of ['x', 'y', 'z']) limiter.check(ip);
  assert.equal(limiter.size(), 3);
  advance(16 * 60_000);
  assert.equal(limiter.prune(), 3);
  assert.equal(limiter.size(), 0);
  // a small window keeps recent clients
  limiter.check('recent');
  assert.equal(limiter.prune(), 0);
  assert.equal(limiter.size(), 1);
});
