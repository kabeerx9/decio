export type GetToken = (options?: { skipCache?: boolean }) => Promise<string | null>;

// Clerk session tokens live ~60s and are cached client-side, so one can expire in flight
// (or early on a device with a slow clock). Retry a 401 once with a freshly minted token;
// a second 401 means the session really is gone and callers treat it as expired.
export function retryOn401(getToken: GetToken, request: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const response = await request(input, init);
    if (response.status !== 401) return response;
    const fresh = await getToken({ skipCache: true });
    if (!fresh) return response;
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${fresh}`);
    return request(input, { ...init, headers });
  };
}
