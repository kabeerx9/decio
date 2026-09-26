import type { TokenRequest } from 'ably';

import { SessionExpiredError } from './profile-api';

export async function fetchRealtimeToken(apiUrl: string, getToken: () => Promise<string | null>, request: typeof fetch = fetch): Promise<TokenRequest> {
  const session = await getToken();
  if (!session) throw new SessionExpiredError();
  const response = await request(`${apiUrl.replace(/\/$/, '')}/v1/realtime/token`, {
    headers: { Authorization: `Bearer ${session}` },
  });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (!response.ok) throw new Error('Realtime is unavailable right now.');
  const token: unknown = await response.json();
  if (typeof token !== 'object' || token === null || !('keyName' in token) || typeof token.keyName !== 'string' ||
    !('mac' in token) || typeof token.mac !== 'string' || !('nonce' in token) || typeof token.nonce !== 'string' ||
    !('capability' in token) || typeof token.capability !== 'string' || !('timestamp' in token) || typeof token.timestamp !== 'number') {
    throw new Error('The realtime token response was unexpected.');
  }
  return token as TokenRequest;
}
