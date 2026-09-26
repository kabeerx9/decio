import { SessionExpiredError } from './profile-api';

export type CityPost = {
  id: string; authorId: string; authorName: string; city: string; body: string;
  hasPhoto: boolean; createdAt: string;
};
export type PostPage = { city: string; posts: CityPost[]; nextCursor: string };
export type PickedPhoto = { uri: string; mimeType: string; fileName: string; fileSize?: number };

export function parsePostPage(value: unknown): PostPage {
  if (!value || typeof value !== 'object' || !('city' in value) || typeof value.city !== 'string' ||
    !('nextCursor' in value) || typeof value.nextCursor !== 'string' || !('posts' in value) || !Array.isArray(value.posts) ||
    !value.posts.every((post) => post && typeof post === 'object' && typeof post.id === 'string' &&
      typeof post.authorId === 'string' && typeof post.authorName === 'string' && typeof post.city === 'string' &&
      typeof post.body === 'string' && typeof post.hasPhoto === 'boolean' && typeof post.createdAt === 'string')) {
    throw new Error('The city feed response was unexpected. Please try again.');
  }
  return value as PostPage;
}

async function sessionToken(getToken: () => Promise<string | null>) {
  const token = await getToken();
  if (!token) throw new SessionExpiredError();
  return token;
}

export async function fetchCityPosts(apiUrl: string, getToken: () => Promise<string | null>, cursor = '', request: typeof fetch = fetch): Promise<PostPage> {
  const token = await sessionToken(getToken);
  const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const response = await request(`${apiUrl.replace(/\/$/, '')}/v1/posts${suffix}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (!response.ok) throw new Error('Could not load city posts. Please try again.');
  return parsePostPage(await response.json());
}

export async function createCityPost(apiUrl: string, getToken: () => Promise<string | null>, body: string, photo?: PickedPhoto, request: typeof fetch = fetch): Promise<void> {
  const trimmed = body.trim();
  if (![...trimmed].length || [...trimmed].length > 1000) throw new Error('Write 1–1000 characters.');
  if (photo?.fileSize && photo.fileSize > 6 * 1024 * 1024) throw new Error('Choose a photo smaller than 6 MB.');
  const token = await sessionToken(getToken);
  const form = new FormData();
  form.append('body', trimmed);
  if (photo) {
    if (typeof document !== 'undefined') {
      const imageResponse = await fetch(photo.uri);
      form.append('photo', await imageResponse.blob(), photo.fileName);
    } else {
      form.append('photo', { uri: photo.uri, type: photo.mimeType, name: photo.fileName } as unknown as Blob);
    }
  }
  const response = await request(`${apiUrl.replace(/\/$/, '')}/v1/posts`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (response.status === 400) throw new Error((await response.text()).trim() || 'Check your post and photo.');
  if (!response.ok) throw new Error('Could not publish your post. Please try again.');
}

export function postPhotoURL(apiUrl: string, id: string): string {
  return `${apiUrl.replace(/\/$/, '')}/v1/posts/${encodeURIComponent(id)}/photo`;
}
