import { SessionExpiredError } from './profile-api';
import { GetToken, retryOn401 } from './http';

export type DirectMessage = { id: string; senderId: string; body: string; createdAt: string };
export type MessagePage = { messages: DirectMessage[]; nextCursor: string };

function parseMessage(value: unknown): DirectMessage {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' ||
    !('senderId' in value) || typeof value.senderId !== 'string' || !('body' in value) || typeof value.body !== 'string' ||
    !('createdAt' in value) || typeof value.createdAt !== 'string') {
    throw new Error('The message response was unexpected.');
  }
  return value as DirectMessage;
}

export function parseMessagePage(value: unknown): MessagePage {
  if (!value || typeof value !== 'object' || !('messages' in value) || !Array.isArray(value.messages) ||
    !('nextCursor' in value) || typeof value.nextCursor !== 'string') {
    throw new Error('The message history response was unexpected.');
  }
  return { messages: value.messages.map(parseMessage), nextCursor: value.nextCursor };
}

async function sessionToken(getToken: GetToken): Promise<string> {
  const token = await getToken();
  if (!token) throw new SessionExpiredError();
  return token;
}

export async function fetchMessages(apiUrl: string, getToken: GetToken, otherID: string, cursor = '', request: typeof fetch = fetch): Promise<MessagePage> {
  const token = await sessionToken(getToken);
  const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const response = await retryOn401(getToken, request)(`${apiUrl.replace(/\/$/, '')}/v1/chats/${encodeURIComponent(otherID)}/messages${suffix}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new SessionExpiredError();
  if (response.status === 403) throw new Error('This chat requires an accepted connection.');
  if (!response.ok) throw new Error('Could not load messages. Please try again.');
  return parseMessagePage(await response.json());
}

export async function sendMessage(apiUrl: string, getToken: GetToken, otherID: string, clientMessageID: string, body: string, request: typeof fetch = fetch): Promise<DirectMessage> {
  const trimmed = body.trim();
  if (!trimmed || [...trimmed].length > 2000) throw new Error('Write 1–2000 characters.');
  const token = await sessionToken(getToken);
  const response = await retryOn401(getToken, request)(`${apiUrl.replace(/\/$/, '')}/v1/chats/${encodeURIComponent(otherID)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientMessageId: clientMessageID, body: trimmed }),
  });
  if (response.status === 401) throw new SessionExpiredError();
  if (response.status === 403) throw new Error('This chat requires an accepted connection.');
  if (response.status === 409) throw new Error('This message retry conflicts with an earlier message.');
  if (!response.ok) throw new Error('Could not send your message. Please try again.');
  return parseMessage(await response.json());
}

export async function markMessagesRead(apiUrl: string, getToken: GetToken, otherID: string, messageID: string, request: typeof fetch = fetch): Promise<void> {
  if (!/^[1-9]\d*$/.test(messageID)) throw new Error('Invalid message ID.');
  const token = await sessionToken(getToken);
  const response = await retryOn401(getToken, request)(`${apiUrl.replace(/\/$/, '')}/v1/chats/${encodeURIComponent(otherID)}/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: messageID }),
  });
  if (response.status === 401) throw new SessionExpiredError();
  if (response.status === 403) throw new Error('This chat requires an accepted connection.');
  if (!response.ok) throw new Error('Could not mark messages as read.');
}
