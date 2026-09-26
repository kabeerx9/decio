import assert from 'node:assert/strict';
import test from 'node:test';

import { createCityPost, fetchCityPosts, parsePostPage, postPhotoURL } from './posts-api';
import { SessionExpiredError } from './profile-api';

test('city feed uses session and cursor, then validates the page', async () => {
  const request: typeof fetch = async (input, init) => {
    assert.equal(input, 'https://api.test/v1/posts?cursor=23');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token');
    return Response.json({ city: 'Mumbai', posts: [{ id: '22', authorId: 'a', authorName: 'Asha', city: 'Mumbai', body: 'Hi', hasPhoto: false, createdAt: '2026-09-27T00:00:00Z' }], nextCursor: '' });
  };
  const page = await fetchCityPosts('https://api.test/', async () => 'token', '23', request);
  assert.equal(page.posts[0].body, 'Hi');
  assert.equal(postPhotoURL('https://api.test/', '22'), 'https://api.test/v1/posts/22/photo');
  assert.throws(() => parsePostPage({ city: 'Mumbai', posts: [{ id: 1 }], nextCursor: '' }));
});

test('post creation sends multipart with text and bearer token', async () => {
  const request: typeof fetch = async (_input, init) => {
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token');
    assert.equal(new Headers(init?.headers).get('Content-Type'), null);
    assert.ok(init?.body instanceof FormData);
    assert.equal(init.body.get('body'), 'Hello city');
    return new Response(null, { status: 201 });
  };
  await createCityPost('https://api.test', async () => 'token', ' Hello city ', undefined, request);
});

test('post creation rejects missing session and invalid text before network', async () => {
  const noNetwork: typeof fetch = async () => { throw new Error('network reached'); };
  await assert.rejects(createCityPost('https://api.test', async () => null, 'Hello', undefined, noNetwork), SessionExpiredError);
  await assert.rejects(createCityPost('https://api.test', async () => 'token', ' ', undefined, noNetwork), /1–1000/);
});
