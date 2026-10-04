// Unit tests for the /random picker (lib/random-pick.js).
//
// Run: node --test test/random-pick.test.mjs   (or: npm test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articleFromTalkTitle, pickRandomArticle } from '../lib/random-pick.js';

test('articleFromTalkTitle strips the Talk: prefix', () => {
  assert.equal(articleFromTalkTitle('Talk:983 royal election'), '983 royal election');
  assert.equal(articleFromTalkTitle('Talk:German–Polish customs war'), 'German–Polish customs war');
  assert.equal(articleFromTalkTitle('983 royal election'), '983 royal election');
});

test('articleFromTalkTitle rejects non-article talk pages and list pages', () => {
  for (const t of [
    'Talk:Template:Infobox',
    'Talk:Category:Biography articles needing infoboxes',
    'Talk:Wikipedia:Manual of Style',
    'Talk:File:Example.jpg',
    'Talk:Portal:History',
    'Talk:Draft:Something',
    'Talk:List of sovereign states',
    '',
    null,
  ]) {
    assert.equal(articleFromTalkTitle(t), null, `should reject ${JSON.stringify(t)}`);
  }
});

test('pickRandomArticle chooses from the valid pool deterministically', () => {
  const members = [
    'Talk:A',
    'Talk:Category:Not an article',
    'Talk:B',
    'Talk:Template:X',
    'Talk:C',
  ];
  assert.equal(pickRandomArticle(members, { rng: () => 0 }), 'A');
  assert.equal(pickRandomArticle(members, { rng: () => 0.5 }), 'B');
  assert.equal(pickRandomArticle(members, { rng: () => 0.99 }), 'C');
});

test('pickRandomArticle avoids recent picks, and falls back when all are recent', () => {
  const members = ['Talk:A', 'Talk:B', 'Talk:C'];
  assert.equal(pickRandomArticle(members, { recent: ['A', 'B'], rng: () => 0 }), 'C');
  // everything recent → repeats allowed rather than failing
  assert.equal(pickRandomArticle(members, { recent: ['A', 'B', 'C'], rng: () => 0 }), 'A');
});

test('pickRandomArticle returns null when nothing is pickable', () => {
  assert.equal(pickRandomArticle([]), null);
  assert.equal(pickRandomArticle(undefined), null);
  assert.equal(pickRandomArticle(['Talk:Template:X', 'Talk:List of things']), null);
});

test('pickRandomArticle deduplicates', () => {
  const picked = new Set();
  for (let i = 0; i < 50; i++) picked.add(pickRandomArticle(['Talk:A', 'Talk:A'], { rng: Math.random }));
  assert.deepEqual([...picked], ['A']);
});
