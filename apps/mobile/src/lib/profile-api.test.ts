import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchMyProfile, saveMyProfile, SessionExpiredError, syncProfileImage } from './profile-api';

const emptyProfile = { id: 'user_1', displayName: '', city: '', bio: '', headline: '', interests: [], imageUrl: '' };

test('fetchMyProfile sends the current Clerk token to the Go API', async () => {
  let authorization = '';
  const profile = await fetchMyProfile('http://localhost:8080', async () => 'session-token', async (_url, options) => {
    authorization = new Headers(options?.headers).get('Authorization') ?? '';
    return new Response(JSON.stringify(emptyProfile), { status: 200 });
  });

  assert.equal(authorization, 'Bearer session-token');
  assert.equal(profile.id, 'user_1');
});

test('saveMyProfile sends a complete edit and fetchMyProfile reloads it', async () => {
  const stored = { ...emptyProfile };
  const requests: string[] = [];
  const request: typeof fetch = async (_url, options) => {
    requests.push(options?.method ?? 'GET');
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer session-token');
    if (options?.method === 'PUT') {
      Object.assign(stored, JSON.parse(String(options.body)));
    }
    return new Response(JSON.stringify(stored), { status: 200 });
  };
  const input = { displayName: ' Kabeer ', city: ' Mumbai ', bio: 'Hello', headline: ' Mobile engineer ', interests: [' Go '] };
  const saved = await saveMyProfile('http://localhost:8080', async () => 'session-token', input, request);
  const reloaded = await fetchMyProfile('http://localhost:8080', async () => 'session-token', request);
  assert.deepEqual(requests, ['PUT', 'GET']);
  assert.deepEqual(reloaded, saved);
  assert.deepEqual(saved, { id: 'user_1', displayName: 'Kabeer', city: 'Mumbai', bio: 'Hello', headline: 'Mobile engineer', interests: ['Go'], imageUrl: '' });
});

test('syncProfileImage sends no client-supplied URL and returns the server profile', async () => {
  const synced = await syncProfileImage('https://api.test/', async () => 'session-token', async (url, options) => {
    assert.equal(url, 'https://api.test/v1/me/image/sync');
    assert.equal(options?.method, 'POST');
    assert.equal(options?.body, undefined);
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer session-token');
    return Response.json({ ...emptyProfile, imageUrl: 'https://images.clerk.test/avatar.jpg' });
  });
  assert.equal(synced.imageUrl, 'https://images.clerk.test/avatar.jpg');
  await assert.rejects(syncProfileImage('https://api.test', async () => null, async () => { throw new Error('network reached'); }), SessionExpiredError);
});

test('saveMyProfile rejects invalid edits before making a request', async () => {
  let called = false;
  await assert.rejects(saveMyProfile('http://localhost:8080', async () => 'session-token',
    { displayName: 'K', city: 'Mumbai', bio: '', headline: '', interests: [] }, async () => { called = true; return new Response(); }), /display name/);
  assert.equal(called, false);
});

test('saveMyProfile rejects an expired session without sending a write', async () => {
  let called = false;
  await assert.rejects(saveMyProfile('http://localhost:8080', async () => null,
    { displayName: 'Kabeer', city: 'Mumbai', bio: '', headline: '', interests: [] }, async () => { called = true; return new Response(); }), SessionExpiredError);
  assert.equal(called, false);
});

test('fetchMyProfile never calls the API without a token', async () => {
  let called = false;
  await assert.rejects(
    fetchMyProfile('http://localhost:8080', async () => null, async () => {
      called = true;
      return new Response();
    }),
    SessionExpiredError,
  );
  assert.equal(called, false);
});

test('fetchMyProfile treats rejected sessions as expired', async () => {
  await assert.rejects(
    fetchMyProfile('http://localhost:8080', async () => 'expired', async () => new Response('', { status: 401 })),
    SessionExpiredError,
  );
});
