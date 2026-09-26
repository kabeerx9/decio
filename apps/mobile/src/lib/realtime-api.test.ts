import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SessionExpiredError } from './profile-api';
import { fetchRealtimeToken } from './realtime-api';

test('requests a signed Ably token using the Clerk session', async () => {
  let path = '';
  let authorization = '';
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    path = String(input);
    authorization = String(init?.headers && (init.headers as Record<string, string>).Authorization);
    return Response.json({ keyName: 'app.key', mac: 'signed', nonce: 'nonce', capability: '{"user:me:events":["subscribe"]}', timestamp: 1 });
  }) as typeof fetch;
  const token = await fetchRealtimeToken('https://api.example/', async () => 'clerk-session', request);
  assert.equal(path, 'https://api.example/v1/realtime/token');
  assert.equal(authorization, 'Bearer clerk-session');
  assert.equal(token.keyName, 'app.key');
});

test('does not call the token endpoint without a session', async () => {
  await assert.rejects(fetchRealtimeToken('https://api.example', async () => null, (() => { throw new Error('unexpected fetch'); }) as typeof fetch), SessionExpiredError);
});

test('treats an expired session as signed out', async () => {
  await assert.rejects(fetchRealtimeToken('https://api.example', async () => 'session', (async () => new Response(null, { status: 401 })) as typeof fetch), SessionExpiredError);
});
