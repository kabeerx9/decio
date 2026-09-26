import { useQueryClient } from '@tanstack/react-query';
import * as Ably from 'ably';
import { useEffect, useRef } from 'react';

import { fetchRealtimeToken, messageChangeOtherUserId } from './realtime-api';

export function useUserEvents(apiUrl: string | undefined, userId: string | null | undefined, getToken: () => Promise<string | null>) {
  const queryClient = useQueryClient();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    if (!apiUrl || !userId) return;
    let closed = false;
    const invalidateConnections = () => { if (!closed) void queryClient.invalidateQueries({ queryKey: ['connections', userId] }); };
    const refreshAfterReconnect = () => {
      invalidateConnections();
      if (!closed) void queryClient.invalidateQueries({ queryKey: ['messages', userId] });
    };
    const invalidateMessages = (message: Ably.InboundMessage) => {
      if (closed) return;
      const otherUserId = messageChangeOtherUserId(message.data);
      if (otherUserId) void queryClient.invalidateQueries({ queryKey: ['messages', userId, otherUserId] });
    };
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
    client.connection.on('connected', refreshAfterReconnect);
    void Promise.all([
      channel.subscribe('connections.changed', invalidateConnections),
      channel.subscribe('messages.changed', invalidateMessages),
    ]).catch((error: unknown) => {
      if (!closed) console.warn('User events unavailable', error);
    });
    return () => {
      closed = true;
      channel.unsubscribe('connections.changed', invalidateConnections);
      channel.unsubscribe('messages.changed', invalidateMessages);
      client.close();
    };
  }, [apiUrl, userId, queryClient]);
}
