import type { InfiniteData } from '@tanstack/react-query';

import type { Connection } from './connections-api';
import type { CityPost, PostPage } from './posts-api';
import { SessionExpiredError } from './profile-api';

export function retryUnlessExpired(failures: number, error: Error): boolean {
  return !(error instanceof SessionExpiredError) && failures < 1;
}

export function connectionBadges(connections: Connection[] | undefined): { requests: number; unread: number } {
  let requests = 0;
  let unread = 0;
  for (const item of connections ?? []) {
    if (item.status === 'incoming') requests += 1;
    else if (item.status === 'accepted') unread += item.unreadCount;
  }
  return { requests, unread };
}

const circleOrder = { incoming: 0, accepted: 1, sent: 2 } as const;

export function groupConnections(connections: Connection[] | undefined): { incoming: Connection[]; circle: Connection[] } {
  const all = connections ?? [];
  return {
    incoming: all.filter((item) => item.status === 'incoming'),
    circle: all.filter((item) => item.status !== 'incoming').sort((a, b) => circleOrder[a.status] - circleOrder[b.status]),
  };
}

export function findCachedPost(data: InfiniteData<PostPage> | undefined, id: string): CityPost | undefined {
  return data?.pages.flatMap((page) => page.posts).find((post) => post.id === id);
}

export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// The server's read cursor only moves forward, so the client just decides *when* to advance it:
// only while the chat is focused and the app is foregrounded, once per newest message.
export function readMarkerToSend({ visible, newestId, lastMarked }: { visible: boolean; newestId: string | undefined; lastMarked: string | null }): string | null {
  if (!visible || !newestId || newestId === lastMarked) return null;
  return newestId;
}

// A rising unread total means a message just arrived; the first load (no previous value) never pings.
export function unreadIncreased(previous: number | undefined, next: number): boolean {
  return previous !== undefined && next > previous;
}
