import { SessionExpiredError } from './profile-api';

export type CityPost = {
  id: string; authorId: string; authorName: string; city: string; body: string;
  authorImageUrl: string; hasPhoto: boolean; createdAt: string;
};
export type PostPage = { city: string; posts: CityPost[]; nextCursor: string };
export type PostReply = { id: string; postId: string; authorId: string; authorName: string; authorImageUrl: string; body: string; createdAt: string };
export type ReplyPage = { replies: PostReply[]; nextCursor: string };
export type PickedPhoto = { uri: string; file: Blob; fileName: string; fileSize?: number };

export function parsePostPage(value: unknown): PostPage {
  if (!value || typeof value !== 'object' || !('city' in value) || typeof value.city !== 'string' ||
    !('nextCursor' in value) || typeof value.nextCursor !== 'string' || !('posts' in value) || !Array.isArray(value.posts) ||
    !value.posts.every((post) => post && typeof post === 'object' && typeof post.id === 'string' &&
      typeof post.authorId === 'string' && typeof post.authorName === 'string' && typeof post.city === 'string' &&
      typeof post.body === 'string' && typeof post.hasPhoto === 'boolean' && typeof post.createdAt === 'string' &&
      (!('authorImageUrl' in post) || typeof post.authorImageUrl === 'string'))) {
    throw new Error('The city feed response was unexpected. Please try again.');
  }
  return { city: value.city, nextCursor: value.nextCursor, posts: value.posts.map((post) => ({ ...post, authorImageUrl: post.authorImageUrl ?? '' })) } as PostPage;
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
  if (photo) form.append('photo', photo.file, photo.fileName);
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

export function parseReplyPage(value: unknown): ReplyPage {
  if (!value || typeof value !== 'object' || !('nextCursor' in value) || typeof value.nextCursor !== 'string' ||
    !('replies' in value) || !Array.isArray(value.replies) || !value.replies.every((reply) =>
      reply && typeof reply === 'object' && typeof reply.id === 'string' && typeof reply.postId === 'string' &&
      typeof reply.authorId === 'string' && typeof reply.authorName === 'string' && typeof reply.body === 'string' &&
      typeof reply.createdAt === 'string' && (!('authorImageUrl' in reply) || typeof reply.authorImageUrl === 'string'))) throw new Error('The replies response was unexpected. Please try again.');
  return { replies: value.replies.map((reply) => ({ ...reply, authorImageUrl: reply.authorImageUrl ?? '' })), nextCursor: value.nextCursor } as ReplyPage;
}

export async function fetchPostReplies(apiUrl: string, getToken: () => Promise<string | null>, postId: string, cursor = '', request: typeof fetch = fetch): Promise<ReplyPage> {
  const token = await sessionToken(getToken);
  const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const response = await request(`${apiUrl.replace(/\/$/, '')}/v1/posts/${encodeURIComponent(postId)}/replies${suffix}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (response.status === 404) throw new Error('This post is no longer available in your city.');
  if (!response.ok) throw new Error('Could not load replies. Please try again.');
  return parseReplyPage(await response.json());
}

export async function createPostReply(apiUrl: string, getToken: () => Promise<string | null>, postId: string, body: string, request: typeof fetch = fetch): Promise<PostReply> {
  const trimmed = body.trim();
  if (![...trimmed].length || [...trimmed].length > 1000) throw new Error('Write 1–1000 characters.');
  const token = await sessionToken(getToken);
  const response = await request(`${apiUrl.replace(/\/$/, '')}/v1/posts/${encodeURIComponent(postId)}/replies`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: trimmed }),
  });
  if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
  if (response.status === 404) throw new Error('This post is no longer available in your city.');
  if (response.status === 400) throw new Error((await response.text()).trim() || 'Check your reply.');
  if (!response.ok) throw new Error('Could not send your reply. Please try again.');
  const reply: unknown = await response.json();
  if (!reply || typeof reply !== 'object' || !('id' in reply) || typeof reply.id !== 'string') throw new Error('The reply response was unexpected. Please try again.');
  return { ...reply, authorImageUrl: 'authorImageUrl' in reply && typeof reply.authorImageUrl === 'string' ? reply.authorImageUrl : '' } as PostReply;
}
