import { parseProfile, Profile, SessionExpiredError } from './profile-api';
import { GetToken, retryOn401 } from './http';

export type PeoplePage = { people: Profile[]; nextCursor: string };

function parsePeoplePage(value: unknown): PeoplePage {
  if (typeof value !== 'object' || value === null || !('people' in value) || !Array.isArray(value.people) ||
    !('nextCursor' in value) || typeof value.nextCursor !== 'string') {
    throw new Error('The people response was unexpected. Please try again.');
  }
  return { people: value.people.map(parseProfile), nextCursor: value.nextCursor };
}

export async function searchPeople(
  apiUrl: string, getToken: GetToken, query: string, cursor = '', request: typeof fetch = fetch,
): Promise<PeoplePage> {
  const token = await getToken();
  if (!token) throw new SessionExpiredError();
  const params = new URLSearchParams({ q: query.trim() });
  if (cursor) params.set('cursor', cursor);
  const response = await retryOn401(getToken, request)(`${apiUrl.replace(/\/$/, '')}/v1/people?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (!response.ok) throw new Error('Could not search people. Please try again.');
  return parsePeoplePage(await response.json());
}

export async function fetchPublicProfile(
  apiUrl: string, getToken: GetToken, id: string, request: typeof fetch = fetch,
): Promise<Profile> {
  const token = await getToken();
  if (!token) throw new SessionExpiredError();
  const response = await retryOn401(getToken, request)(`${apiUrl.replace(/\/$/, '')}/v1/people/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (response.status === 404) throw new Error('This profile is no longer available.');
  if (!response.ok) throw new Error('Could not load this profile. Please try again.');
  return parseProfile(await response.json());
}
