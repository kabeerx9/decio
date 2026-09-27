import assert from 'node:assert/strict';
import { test } from 'node:test';

import { profileGate, signOutOnce } from './session-gate';

test('profileGate keeps the app mounted when a background refetch fails but data exists', () => {
  assert.equal(profileGate({ signedIn: true, hasApiUrl: true, error: new Error('offline'), hasData: true }), 'ready');
});

test('profileGate blocks on an error only when no profile has ever loaded', () => {
  assert.equal(profileGate({ signedIn: true, hasApiUrl: true, error: new Error('offline'), hasData: false }), 'error');
  assert.equal(profileGate({ signedIn: true, hasApiUrl: false, error: null, hasData: false }), 'error');
  assert.equal(profileGate({ signedIn: true, hasApiUrl: true, error: null, hasData: false }), 'loading');
  assert.equal(profileGate({ signedIn: false, hasApiUrl: true, error: null, hasData: false }), 'signedOut');
});

test('signOutOnce signs out once for concurrent expiry reports', async () => {
  let calls = 0;
  const signOut = signOutOnce(async () => { calls += 1; });
  signOut(); signOut(); signOut();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
});

test('signOutOnce allows a retry after a failed sign out', async () => {
  let calls = 0;
  const signOut = signOutOnce(async () => { calls += 1; if (calls === 1) throw new Error('offline'); });
  signOut();
  await new Promise((resolve) => setImmediate(resolve));
  signOut();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
});
