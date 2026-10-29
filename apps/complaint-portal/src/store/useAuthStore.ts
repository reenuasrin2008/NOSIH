import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setApiAccessToken } from '../api/client';
import type { LoginResponse, SessionProfile } from '../api/client';

interface AuthState {
  token: string | null;
  user: SessionProfile | null;
  hasHydrated: boolean;
  setSession: (session: LoginResponse) => void;
  logout: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hasHydrated: false,
      setSession: ({ access_token, user }) => {
        setApiAccessToken(access_token);
        set({ token: access_token, user });
      },
      logout: () => {
        setApiAccessToken(null);
        set({ token: null, user: null });
      },
      setHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: 'nosih.portal.session',
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        setApiAccessToken(state?.token ?? null);
        state?.setHydrated();
      },
    },
  ),
);
