import { GetToken, retryOn401 } from './http';

export type ProfileInput = { displayName: string; city: string; bio: string; headline: string; interests: string[] };
export type Profile = ProfileInput & { id: string; imageUrl: string; onboardingComplete: boolean };

export class SessionExpiredError extends Error {
  constructor() { super('Your session has ended. Please sign in again.'); }
}

export function parseProfile(value: unknown): Profile {
  if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string' ||
    !('displayName' in value) || typeof value.displayName !== 'string' ||
    !('city' in value) || typeof value.city !== 'string' ||
    !('bio' in value) || typeof value.bio !== 'string' ||
    !('headline' in value) || typeof value.headline !== 'string' ||
    !('interests' in value) || !Array.isArray(value.interests) || !value.interests.every((interest) => typeof interest === 'string') ||
    ('imageUrl' in value && typeof value.imageUrl !== 'string') ||
    ('onboardingComplete' in value && typeof value.onboardingComplete !== 'boolean')) {
    throw new Error('The profile response was unexpected. Please try again.');
  }
  return { ...value, imageUrl: 'imageUrl' in value ? value.imageUrl : '', onboardingComplete: 'onboardingComplete' in value ? value.onboardingComplete : false } as Profile;
}

export async function completeOnboarding(apiUrl: string, getToken: GetToken, request: typeof fetch = fetch): Promise<Profile> {
  const token = await getToken();
  if (!token) throw new SessionExpiredError();
  const response = await retryOn401(getToken, request)(`${apiUrl.replace(/\/$/, '')}/v1/me/onboarding/complete`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (response.status === 409) throw new Error((await response.text()).trim() || 'Add your name, city, and photo first.');
  if (!response.ok) throw new Error('Could not finish onboarding. Please try again.');
  return parseProfile(await response.json());
}

export async function syncProfileImage(apiUrl: string, getToken: GetToken, request: typeof fetch = fetch): Promise<Profile> {
  const token = await getToken();
  if (!token) throw new SessionExpiredError();
  const response = await retryOn401(getToken, request)(`${apiUrl.replace(/\/$/, '')}/v1/me/image/sync`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (!response.ok) throw new Error('Clerk saved your photo, but Decio could not update it. Try again.');
  return parseProfile(await response.json());
}

export function normalizeProfileInput(input: ProfileInput): ProfileInput {
  return {
    displayName: input.displayName.trim(), city: input.city.trim(), bio: input.bio.trim(),
    headline: input.headline.trim(), interests: input.interests.map((interest) => interest.trim()),
  };
}

export function validateProfileInput(input: ProfileInput): string | null {
  const length = (value: string) => [...value].length;
  if (length(input.displayName) < 2 || length(input.displayName) > 60 || /[\r\n]/.test(input.displayName)) return 'Use a display name of 2–60 characters on one line.';
  if (length(input.city) < 2 || length(input.city) > 80 || /[\r\n]/.test(input.city)) return 'Choose a city of 2–80 characters.';
  if (length(input.bio) > 280) return 'Keep your bio to 280 characters or fewer.';
  if (length(input.headline) > 80 || /[\r\n]/.test(input.headline)) return 'Keep your headline to 80 characters on one line.';
  if (input.interests.length > 3 || input.interests.some((interest) => length(interest) < 2 || length(interest) > 24 || /[\r\n]/.test(interest))) return 'Choose up to three interests, each 2–24 characters.';
  if (new Set(input.interests.map((interest) => interest.toLowerCase())).size !== input.interests.length) return 'Choose different interests.';
  return null;
}

export async function fetchMyProfile(apiUrl: string, getToken: GetToken, request: typeof fetch = fetch): Promise<Profile> {
  const token = await getToken();
  if (!token) throw new SessionExpiredError();
  const response = await retryOn401(getToken, request)(`${apiUrl.replace(/\/$/, '')}/v1/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (!response.ok) throw new Error('Your profile is unavailable right now. Please try again.');
  return parseProfile(await response.json());
}

export async function saveMyProfile(apiUrl: string, getToken: GetToken, input: ProfileInput, request: typeof fetch = fetch): Promise<Profile> {
  const normalized = normalizeProfileInput(input);
  const validation = validateProfileInput(normalized);
  if (validation) throw new Error(validation);
  const token = await getToken();
  if (!token) throw new SessionExpiredError();
  const response = await retryOn401(getToken, request)(`${apiUrl.replace(/\/$/, '')}/v1/me`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(normalized),
  });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (response.status === 400) throw new Error((await response.text()).trim() || 'Check your profile details.');
  if (!response.ok) throw new Error('Could not save your profile. Please try again.');
  return parseProfile(await response.json());
}
