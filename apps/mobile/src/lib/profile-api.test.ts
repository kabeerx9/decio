import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchMyProfile, SessionExpiredError } from './profile-api';

test('fetchMyProfile sends the current Clerk token to the Go API', async () => {
  let authorization = '';
  const profile = await fetchMyProfile('http://localhost:8080', async () => 'session-token', async (_url, options) => {
    authorization = new Headers(options?.headers).get('Authorization') ?? '';
    return new Response(JSON.stringify({ id: 'user_1', displayName: '', city: '' }), { status: 200 });
  });

  assert.equal(authorization, 'Bearer session-token');
  assert.equal(profile.id, 'user_1');
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
