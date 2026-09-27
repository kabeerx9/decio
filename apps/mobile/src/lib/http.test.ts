import assert from 'node:assert/strict';
import { test } from 'node:test';

import { retryOn401 } from './http';

type Call = { auth: string | null; body: BodyInit | null | undefined };

function recorder(statuses: number[]) {
  const calls: Call[] = [];
  const request = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ auth: new Headers(init?.headers).get('Authorization'), body: init?.body });
    return new Response('{}', { status: statuses[calls.length - 1] ?? 200 });
  }) as typeof fetch;
  return { calls, request };
}

test('retryOn401 retries once with a fresh token when the cached one expired in flight', async () => {
  const { calls, request } = recorder([401, 200]);
  const tokenRequests: unknown[] = [];
  const send = retryOn401(async (options) => { tokenRequests.push(options); return 'fresh'; }, request);
  const response = await send('http://api/v1/me', { method: 'POST', headers: { Authorization: 'Bearer stale' }, body: 'x' });
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((call) => call.auth), ['Bearer stale', 'Bearer fresh']);
  assert.equal(calls[1].body, 'x');
  assert.deepEqual(tokenRequests, [{ skipCache: true }]);
});

test('retryOn401 returns the second 401 so callers still treat a dead session as expired', async () => {
  const { calls, request } = recorder([401, 401]);
  const response = await retryOn401(async () => 'fresh', request)('http://api/v1/me', { headers: { Authorization: 'Bearer stale' } });
  assert.equal(response.status, 401);
  assert.equal(calls.length, 2);
});

test('retryOn401 does not retry when Clerk has no fresh token', async () => {
  const { calls, request } = recorder([401]);
  const response = await retryOn401(async () => null, request)('http://api/v1/me', { headers: { Authorization: 'Bearer stale' } });
  assert.equal(response.status, 401);
  assert.equal(calls.length, 1);
});

test('retryOn401 leaves other statuses alone, including 403', async () => {
  for (const status of [200, 403, 500]) {
    const { calls, request } = recorder([status]);
    const response = await retryOn401(async () => 'fresh', request)('http://api/x', { headers: { Authorization: 'Bearer t' } });
    assert.equal(response.status, status);
    assert.equal(calls.length, 1);
  }
});
