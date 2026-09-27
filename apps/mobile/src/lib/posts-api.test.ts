import assert from 'node:assert/strict';
import test from 'node:test';

import { createCityPost, createPostReply, fetchCityPosts, fetchPostReplies, parsePostPage, postPhotoURL } from './posts-api';
import { SessionExpiredError } from './profile-api';

test('city feed uses session and cursor, then validates the page', async () => {
  const request: typeof fetch = async (input, init) => {
    assert.equal(input, 'https://api.test/v1/posts?cursor=23');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token');
    return Response.json({ city: 'Mumbai', posts: [{ id: '22', authorId: 'a', authorName: 'Asha', authorImageUrl: 'https://images.clerk.test/asha.jpg', city: 'Mumbai', body: 'Hi', hasPhoto: false, createdAt: '2026-09-27T00:00:00Z' }], nextCursor: '' });
  };
  const page = await fetchCityPosts('https://api.test/', async () => 'token', '23', request);
  assert.equal(page.posts[0].body, 'Hi');
  assert.equal(page.posts[0].authorImageUrl, 'https://images.clerk.test/asha.jpg');
  assert.equal(postPhotoURL('https://api.test/', '22'), 'https://api.test/v1/posts/22/photo');
  assert.throws(() => parsePostPage({ city: 'Mumbai', posts: [{ id: 1 }], nextCursor: '' }));
});

test('replies use the post URL, cursor, verified session, and JSON body', async () => {
  const getRequest: typeof fetch = async (input, init) => {
    assert.equal(input, 'https://api.test/v1/posts/22/replies?cursor=3');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token');
    return Response.json({ replies: [{ id: '4', postId: '22', authorId: 'a', authorName: 'Asha', body: 'Hello', createdAt: '2026-09-27T00:00:00Z' }], nextCursor: '' });
  };
  assert.equal((await fetchPostReplies('https://api.test/', async () => 'token', '22', '3', getRequest)).replies[0].body, 'Hello');
  const postRequest: typeof fetch = async (input, init) => {
    assert.equal(input, 'https://api.test/v1/posts/22/replies');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token');
    assert.deepEqual(JSON.parse(String(init?.body)), { body: 'Hello' });
    return Response.json({ id: '4', postId: '22', authorId: 'a', authorName: 'Asha', body: 'Hello', createdAt: '2026-09-27T00:00:00Z' }, { status: 201 });
  };
  await createPostReply('https://api.test/', async () => 'token', '22', ' Hello ', postRequest);
  const noNetwork: typeof fetch = async () => { throw new Error('network reached'); };
  await assert.rejects(createPostReply('https://api.test', async () => null, '22', 'Hello', noNetwork), SessionExpiredError);
  await assert.rejects(createPostReply('https://api.test', async () => 'token', '22', ' ', noNetwork), /1–1000/);
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

test('photo creation sends the prepared file as a multipart part', async () => {
  class TestFormData {
    parts: [string, unknown][] = [];
    append(name: string, value: unknown) { this.parts.push([name, value]); }
  }
  const originalFormData = globalThis.FormData;
  globalThis.FormData = TestFormData as unknown as typeof FormData;
  try {
    const file = { name: 'city-photo.jpg', type: 'image/jpeg', bytes: async () => new Uint8Array([1, 2, 3]) } as unknown as Blob;
    const request: typeof fetch = async (_input, init) => {
      assert.deepEqual((init?.body as unknown as TestFormData).parts, [
        ['body', 'Hello city'],
        ['photo', file],
      ]);
      return new Response(null, { status: 201 });
    };
    await createCityPost('https://api.test', async () => 'token', 'Hello city', {
      uri: 'file:///city-photo.jpg', file, fileName: 'city-photo.jpg',
    }, request);
  } finally {
    globalThis.FormData = originalFormData;
  }
});

test('post creation rejects missing session and invalid text before network', async () => {
  const noNetwork: typeof fetch = async () => { throw new Error('network reached'); };
  await assert.rejects(createCityPost('https://api.test', async () => null, 'Hello', undefined, noNetwork), SessionExpiredError);
  await assert.rejects(createCityPost('https://api.test', async () => 'token', ' ', undefined, noNetwork), /1–1000/);
});
