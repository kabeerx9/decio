export type Profile = { id: string; displayName: string; city: string };

export class SessionExpiredError extends Error {
  constructor() { super('Your session has ended. Please sign in again.'); }
}

export async function fetchMyProfile(apiUrl: string, getToken: () => Promise<string | null>, request: typeof fetch = fetch): Promise<Profile> {
  const token = await getToken();
  if (!token) throw new SessionExpiredError();
  const response = await request(`${apiUrl.replace(/\/$/, '')}/v1/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (!response.ok) throw new Error('Your profile is unavailable right now. Please try again.');
  const profile: unknown = await response.json();
  if (typeof profile !== 'object' || profile === null || !('id' in profile) || typeof profile.id !== 'string' || !('displayName' in profile) || typeof profile.displayName !== 'string' || !('city' in profile) || typeof profile.city !== 'string') {
    throw new Error('The profile response was unexpected. Please try again.');
  }
  return profile as Profile;
}
