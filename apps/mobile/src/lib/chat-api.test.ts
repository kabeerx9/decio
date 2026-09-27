import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchMessages, markMessagesRead, parseMessagePage, sendMessage } from './chat-api';
import { SessionExpiredError } from './profile-api';

test('loads authenticated, paginated history with string IDs', async () => {
  let requested = '';
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requested = `${String(input)}|${(init?.headers as Record<string, string>).Authorization}`;
    return Response.json({ messages: [{ id: '9007199254740993', senderId: 'me', body: 'hi', createdAt: '2026-09-27T00:00:00Z' }], nextCursor: '9007199254740993' });
  }) as typeof fetch;
  const page = await fetchMessages('https://api.example/', async () => 'session', 'other/id', '42', request);
  assert.equal(requested, 'https://api.example/v1/chats/other%2Fid/messages?cursor=42|Bearer session');
  assert.equal(page.messages[0].id, '9007199254740993');
  assert.equal(page.nextCursor, '9007199254740993');
  assert.deepEqual(parseMessagePage({ messages: [], nextCursor: '' }), { messages: [], nextCursor: '' });
});

test('sends a stable retry ID and handles chat authorization', async () => {
  let sent: unknown;
  const request = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({ id: '15', senderId: 'me', body: 'hello', createdAt: '2026-09-27T00:00:00Z' }, { status: 201 });
  }) as typeof fetch;
  const message = await sendMessage('https://api.example', async () => 'session', 'other', 'stable-id', ' hello ', request);
  assert.deepEqual(sent, { clientMessageId: 'stable-id', body: 'hello' });
  assert.equal(message.id, '15');
  await assert.rejects(fetchMessages('https://api.example', async () => 'session', 'other', '', (async () => new Response(null, { status: 403 })) as typeof fetch), /accepted connection/);
});

test('never sends a message without a session', async () => {
  await assert.rejects(sendMessage('https://api.example', async () => null, 'other', 'id', 'hi', (() => { throw new Error('unexpected fetch'); }) as typeof fetch), SessionExpiredError);
});

test('marks the newest loaded message as read with the viewer session', async () => {
  let requested = '';
  await markMessagesRead('https://api.example/', async () => 'session', 'other/id', '9007199254740993', (async (input, init) => {
    requested = `${String(input)}|${init?.method}|${new Headers(init?.headers).get('Authorization')}|${init?.body}`;
    return new Response(null, { status: 204 });
  }) as typeof fetch);
  assert.equal(requested, 'https://api.example/v1/chats/other%2Fid/read|POST|Bearer session|{"messageId":"9007199254740993"}');
  await assert.rejects(markMessagesRead('https://api.example', async () => 'session', 'other', '1', (async () => new Response(null, { status: 403 })) as typeof fetch), /accepted connection/);
  await assert.rejects(markMessagesRead('https://api.example', async () => null, 'other', '1', (() => { throw new Error('unexpected fetch'); }) as typeof fetch), SessionExpiredError);
});
