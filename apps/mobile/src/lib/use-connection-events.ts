import { useQueryClient } from '@tanstack/react-query';
import * as Ably from 'ably';
import { useEffect, useRef } from 'react';

import { fetchRealtimeToken } from './realtime-api';

export function useConnectionEvents(apiUrl: string | undefined, userId: string | null | undefined, getToken: () => Promise<string | null>) {
  const queryClient = useQueryClient();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    if (!apiUrl || !userId) return;
    let closed = false;
    const invalidate = () => { if (!closed) void queryClient.invalidateQueries({ queryKey: ['connections', userId] }); };
    const client = new Ably.Realtime({
      autoConnect: true,
      authCallback: (_params, callback) => {
        void fetchRealtimeToken(apiUrl, () => getTokenRef.current()).then(
          (token) => callback(null, token),
          (error: unknown) => callback(error instanceof Error ? error.message : String(error), null),
        );
      },
    });
    const channel = client.channels.get(`user:${userId}:events`);
    client.connection.on('connected', invalidate);
    void channel.subscribe('connections.changed', invalidate).catch((error: unknown) => {
      if (!closed) console.warn('Connection events unavailable', error);
    });
    return () => {
      closed = true;
      channel.unsubscribe('connections.changed', invalidate);
      client.close();
    };
  }, [apiUrl, userId, queryClient]);
}
