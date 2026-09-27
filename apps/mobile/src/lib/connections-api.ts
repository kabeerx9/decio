import { parseProfile, Profile, SessionExpiredError } from './profile-api';

export type Connection = { other: Profile; status: 'incoming' | 'sent' | 'accepted'; unreadCount: number };

function parseConnections(value: unknown): Connection[] {
  if (typeof value !== 'object' || value === null || !('connections' in value) || !Array.isArray(value.connections)) {
    throw new Error('The connections response was unexpected. Please try again.');
  }
  return value.connections.map((item: unknown) => {
    if (typeof item !== 'object' || item === null || !('other' in item) || !('status' in item) ||
      !['incoming', 'sent', 'accepted'].includes(String(item.status))) {
      throw new Error('The connections response was unexpected. Please try again.');
    }
    const unreadCount = 'unreadCount' in item ? item.unreadCount : 0;
    if (typeof unreadCount !== 'number' || !Number.isSafeInteger(unreadCount) || unreadCount < 0) {
      throw new Error('The connections response was unexpected. Please try again.');
    }
    return { other: parseProfile(item.other), status: item.status, unreadCount } as Connection;
  });
}

async function sessionToken(getToken: () => Promise<string | null>): Promise<string> {
  const token = await getToken();
  if (!token) throw new SessionExpiredError();
  return token;
}

export async function fetchConnections(apiUrl: string, getToken: () => Promise<string | null>, request: typeof fetch = fetch): Promise<Connection[]> {
  const token = await sessionToken(getToken);
  const response = await request(`${apiUrl.replace(/\/$/, '')}/v1/connections`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (!response.ok) throw new Error('Could not load connections. Please try again.');
  return parseConnections(await response.json());
}

export async function requestConnection(apiUrl: string, getToken: () => Promise<string | null>, userID: string, request: typeof fetch = fetch): Promise<void> {
  const token = await sessionToken(getToken);
  const response = await request(`${apiUrl.replace(/\/$/, '')}/v1/connections`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: userID }),
  });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (response.status === 409) throw new Error('A connection already exists with this person.');
  if (response.status === 400) throw new Error('Complete your profile before connecting.');
  if (response.status === 404) throw new Error('This profile is no longer available.');
  if (!response.ok) throw new Error('Could not send the request. Please try again.');
}

export async function acceptConnection(apiUrl: string, getToken: () => Promise<string | null>, requesterID: string, request: typeof fetch = fetch): Promise<void> {
  const token = await sessionToken(getToken);
  const response = await request(`${apiUrl.replace(/\/$/, '')}/v1/connections/${encodeURIComponent(requesterID)}/accept`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (response.status === 404) throw new Error('This request is no longer pending.');
  if (!response.ok) throw new Error('Could not accept the request. Please try again.');
}
