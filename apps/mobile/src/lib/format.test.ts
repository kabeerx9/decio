import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isEmojiOnly, timeAgo } from './format';

const now = new Date('2026-09-27T12:00:00Z');

test('timeAgo buckets recent times into short labels', () => {
  assert.equal(timeAgo('2026-09-27T11:59:30Z', now), 'now');
  assert.equal(timeAgo('2026-09-27T11:55:00Z', now), '5m');
  assert.equal(timeAgo('2026-09-27T09:00:00Z', now), '3h');
  assert.equal(timeAgo('2026-09-25T12:00:00Z', now), '2d');
});

test('timeAgo falls back to a short date after a week', () => {
  assert.equal(timeAgo('2026-09-12T12:00:00Z', now), '12 Sept');
});

test('timeAgo treats server times ahead of the device clock as now', () => {
  assert.equal(timeAgo('2026-09-27T12:03:00Z', now), 'now');
});

test('timeAgo returns an empty label for unparseable input', () => {
  assert.equal(timeAgo('not a date', now), '');
});

test('isEmojiOnly accepts one to three emoji including modifiers and joiners', () => {
  for (const text of ['🙌', '👍🏽', '👨‍👩‍👧', '❤️', '🙌 🙌', '🔥🔥🔥']) assert.equal(isEmojiOnly(text), true, text);
});

test('isEmojiOnly rejects text, digits, symbols and long emoji runs', () => {
  for (const text of ['', 'ok 🙌', '123', '#1', '🔥🔥🔥🔥', ' ']) assert.equal(isEmojiOnly(text), false, text);
});
