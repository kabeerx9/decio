import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchPublicProfile, searchPeople } from './people-api';
import { SessionExpiredError } from './profile-api';

const person = { id: 'user_2', displayName: 'Asha', city: 'Mumbai', bio: 'Hello', headline: 'Designer', interests: ['Art'] };

test('searchPeople sends an authenticated, encoded query and cursor', async () => {
  let requestedURL = '';
  const page = await searchPeople('http://localhost:8080/', async () => 'session', '  Go & Design  ', 'user_1', async (url, options) => {
    requestedURL = String(url);
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer session');
    return new Response(JSON.stringify({ people: [person], nextCursor: 'user_2' }), { status: 200 });
  });
  assert.equal(requestedURL, 'http://localhost:8080/v1/people?q=Go+%26+Design&cursor=user_1');
  assert.deepEqual(page, { people: [person], nextCursor: 'user_2' });
});

test('searchPeople rejects malformed profile data', async () => {
  await assert.rejects(searchPeople('http://localhost:8080', async () => 'session', '', '',
    async () => new Response(JSON.stringify({ people: [{ id: 'user_2', email: 'private' }], nextCursor: '' }), { status: 200 })), /unexpected/);
});

test('searchPeople never requests data without a session', async () => {
  let called = false;
  await assert.rejects(searchPeople('http://localhost:8080', async () => null, '', '', async () => {
    called = true;
    return new Response();
  }), SessionExpiredError);
  assert.equal(called, false);
});

test('fetchPublicProfile loads an authenticated profile', async () => {
  let requestedURL = '';
  const loaded = await fetchPublicProfile('http://localhost:8080', async () => 'session', 'user_2', async (url, options) => {
    requestedURL = String(url);
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer session');
    return new Response(JSON.stringify(person), { status: 200 });
  });
  assert.equal(requestedURL, 'http://localhost:8080/v1/people/user_2');
  assert.deepEqual(loaded, person);
});
