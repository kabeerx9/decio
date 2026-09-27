import { createContext, ReactNode, useContext, useEffect } from 'react';

import { Profile, SessionExpiredError } from './profile-api';

export type Session = {
  apiUrl: string; userId: string; getToken: () => Promise<string | null>;
  profile: Profile; signOutLocal: () => void;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ value, children }: { value: Session | null; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside a signed-in SessionProvider');
  return session;
}

export function useSignOutOnExpiry(...errors: unknown[]) {
  const { signOutLocal } = useSession();
  const expired = errors.some((error) => error instanceof SessionExpiredError);
  useEffect(() => { if (expired) signOutLocal(); }, [expired, signOutLocal]);
}
