import assert from 'node:assert/strict';
import { test } from 'node:test';

import { acceptConnection, fetchConnections, requestConnection } from './connections-api';
import { SessionExpiredError } from './profile-api';

test('connection list sends the session and preserves incoming state', async () => {
  const list = await fetchConnections('http://localhost:8080', async () => 'token', async (url, options) => {
    assert.equal(url, 'http://localhost:8080/v1/connections');
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer token');
    return new Response(JSON.stringify({ connections: [{ other: { id: 'other', displayName: 'Asha', city: 'Mumbai', bio: '', headline: '', interests: [] }, status: 'incoming', unreadCount: 0 }] }), { status: 200 });
  });
  assert.equal(list[0].status, 'incoming');
  assert.equal(list[0].other.id, 'other');
  assert.equal(list[0].unreadCount, 0);
});

test('connection list keeps unread counts and rejects invalid counts', async () => {
  const other = { id: 'other', displayName: 'Asha', city: 'Mumbai', bio: '', headline: '', interests: [] };
  const list = await fetchConnections('http://localhost:8080', async () => 'token', (async () => Response.json({ connections: [{ other, status: 'accepted', unreadCount: 3 }] })) as typeof fetch);
  assert.equal(list[0].unreadCount, 3);
  await assert.rejects(fetchConnections('http://localhost:8080', async () => 'token', (async () => Response.json({ connections: [{ other, status: 'accepted', unreadCount: -1 }] })) as typeof fetch), /unexpected/);
});

test('request and accept target another user with the session', async () => {
  const calls: string[] = [];
  const request = async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer token');
    calls.push(`${options?.method} ${url} ${options?.body ?? ''}`);
    return new Response(null, { status: calls.length === 1 ? 201 : 204 });
  };
  await requestConnection('http://localhost:8080', async () => 'token', 'other', request);
  await acceptConnection('http://localhost:8080', async () => 'token', 'other', request);
  assert.deepEqual(calls, [
    'POST http://localhost:8080/v1/connections {"userId":"other"}',
    'POST http://localhost:8080/v1/connections/other/accept ',
  ]);
});

test('connection writes stop on expired sessions and show a duplicate conflict', async () => {
  let called = false;
  await assert.rejects(requestConnection('http://localhost:8080', async () => null, 'other', async () => { called = true; return new Response(); }), SessionExpiredError);
  assert.equal(called, false);
  await assert.rejects(requestConnection('http://localhost:8080', async () => 'token', 'other', async () => new Response(null, { status: 409 })), /already/);
  await assert.rejects(requestConnection('http://localhost:8080', async () => 'token', 'other', async () => new Response(null, { status: 400 })), /Complete your profile/);
});
