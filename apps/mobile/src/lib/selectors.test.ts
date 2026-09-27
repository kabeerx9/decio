import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Connection } from './connections-api';
import type { CityPost, PostPage } from './posts-api';
import { Profile, SessionExpiredError } from './profile-api';
import { connectionBadges, findCachedPost, groupConnections, retryUnlessExpired, uniqueById } from './selectors';

const person = (id: string): Profile => ({ id, displayName: id, city: 'Pune', bio: '', headline: '', interests: [], imageUrl: '', onboardingComplete: true });
const connection = (id: string, status: Connection['status'], unreadCount = 0): Connection => ({ other: person(id), status, unreadCount });
const post = (id: string): CityPost => ({ id, authorId: 'a', authorName: 'A', city: 'Pune', body: 'hi', authorImageUrl: '', hasPhoto: false, createdAt: '2026-09-27T12:00:00Z' });

test('retryUnlessExpired retries once but never an expired session', () => {
  assert.equal(retryUnlessExpired(0, new Error('network')), true);
  assert.equal(retryUnlessExpired(1, new Error('network')), false);
  assert.equal(retryUnlessExpired(0, new SessionExpiredError()), false);
});

test('connectionBadges counts incoming requests and unread in accepted chats only', () => {
  const badges = connectionBadges([connection('a', 'incoming', 4), connection('b', 'accepted', 2), connection('c', 'accepted', 3), connection('d', 'sent', 9)]);
  assert.deepEqual(badges, { requests: 1, unread: 5 });
  assert.deepEqual(connectionBadges(undefined), { requests: 0, unread: 0 });
});

test('groupConnections separates incoming requests and orders the circle accepted before sent', () => {
  const { incoming, circle } = groupConnections([connection('s', 'sent'), connection('i', 'incoming'), connection('a', 'accepted')]);
  assert.deepEqual(incoming.map((item) => item.other.id), ['i']);
  assert.deepEqual(circle.map((item) => item.other.id), ['a', 's']);
});

test('findCachedPost searches every cached page and reports a miss', () => {
  const data = { pageParams: ['', 'p2'], pages: [{ city: 'Pune', posts: [post('p1')], nextCursor: 'p2' }, { city: 'Pune', posts: [post('p3')], nextCursor: '' }] satisfies PostPage[] };
  assert.equal(findCachedPost(data, 'p3')?.id, 'p3');
  assert.equal(findCachedPost(data, 'missing'), undefined);
  assert.equal(findCachedPost(undefined, 'p1'), undefined);
});

test('uniqueById keeps the first occurrence when pages overlap', () => {
  const items = uniqueById([{ id: '1', v: 'first' }, { id: '2', v: 'x' }, { id: '1', v: 'dupe' }]);
  assert.deepEqual(items, [{ id: '1', v: 'first' }, { id: '2', v: 'x' }]);
});
