export type GateState = 'signedOut' | 'loading' | 'error' | 'ready';

// A profile that loaded once stays usable when a background refetch fails; only a
// first load with no data (or no API URL) blocks the app behind the error screen.
export function profileGate({ signedIn, hasApiUrl, error, hasData }: { signedIn: boolean; hasApiUrl: boolean; error: unknown; hasData: boolean }): GateState {
  if (!signedIn) return 'signedOut';
  if (hasData) return 'ready';
  if (!hasApiUrl || error) return 'error';
  return 'loading';
}

// Several screens can report the same expired session in one render; sign out once.
// A failed sign-out re-arms it so the button and later expiries still work.
export function signOutOnce(signOut: () => Promise<unknown>) {
  let inFlight = false;
  const run = () => {
    if (inFlight) return;
    inFlight = true;
    signOut().catch(() => { inFlight = false; });
  };
  return Object.assign(run, { reset: () => { inFlight = false; } });
}
