import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { fetchConnections } from './connections-api';
import { fetchCityPosts } from './posts-api';
import { completeOnboarding, Profile, ProfileInput, saveMyProfile, SessionExpiredError, syncProfileImage } from './profile-api';
import { retryUnlessExpired } from './selectors';
import { useSession, useSignOutOnExpiry } from './session';

export function useConnections() {
  const { apiUrl, userId, getToken } = useSession();
  const query = useQuery({ queryKey: ['connections', userId], queryFn: () => fetchConnections(apiUrl, getToken), retry: retryUnlessExpired });
  useSignOutOnExpiry(query.error);
  return query;
}

export function useCityFeed() {
  const { apiUrl, userId, getToken, profile } = useSession();
  const query = useInfiniteQuery({
    queryKey: ['posts', userId, profile.city],
    initialPageParam: '',
    queryFn: ({ pageParam }) => fetchCityPosts(apiUrl, getToken, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    retry: retryUnlessExpired,
    enabled: !!profile.city,
  });
  useSignOutOnExpiry(query.error);
  return query;
}

// Pull-to-refresh spinner only for refreshes the user started; background refetches
// (realtime events, focus, invalidations) stay silent instead of flashing the spinner.
export function usePullRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  };
  return { refreshing, onRefresh };
}

export function usePhotoToken(): string | null {
  const { userId, getToken } = useSession();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getToken().then((value) => { if (active) setToken(value); }, () => { if (active) setToken(null); });
    return () => { active = false; };
  }, [getToken, userId]);
  return token;
}

export function useProfileActions() {
  const { apiUrl, userId, getToken, signOutLocal } = useSession();
  const queryClient = useQueryClient();
  return useMemo(() => {
    const guarded = async (work: () => Promise<void>) => {
      try { await work(); } catch (failure) {
        if (failure instanceof SessionExpiredError) signOutLocal();
        throw failure;
      }
    };
    const store = (profile: Profile) => { queryClient.setQueryData(['profile', userId], profile); };
    return {
      saveProfile: (input: ProfileInput) => guarded(async () => store(await saveMyProfile(apiUrl, getToken, input))),
      syncImage: () => guarded(async () => {
        store(await syncProfileImage(apiUrl, getToken));
        for (const key of ['people', 'connections', 'posts']) void queryClient.invalidateQueries({ queryKey: [key, userId] });
      }),
      finishOnboarding: () => guarded(async () => store(await completeOnboarding(apiUrl, getToken))),
    };
  }, [apiUrl, getToken, queryClient, signOutLocal, userId]);
}
