import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, TOKEN_STORAGE_KEY } from '../api/client';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  initializing: boolean;
  authenticating: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  restore: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(persist((set, get) => ({
  user: null,
  token: null,
  initializing: true,
  authenticating: false,
  error: null,
  login: async (email, password) => {
    set({ authenticating: true, error: null });
    try {
      const response = await api.auth.login(email.trim().toLowerCase(), password);
      localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
      set({ token: response.access_token, user: response.user, authenticating: false });
    } catch (error) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      set({ token: null, user: null, authenticating: false, error: error instanceof Error ? error.message : 'Sign in failed' });
      throw error;
    }
  },
  restore: async () => {
    const token = get().token ?? localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      set({ initializing: false, user: null });
      return;
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    try {
      const user = await api.auth.me();
      set({ user, token, initializing: false, error: null });
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      set({ user: null, token: null, initializing: false });
    }
  },
  logout: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    set({ user: null, token: null, error: null, initializing: false });
  },
}), {
  name: 'nosih.admin.session',
  partialize: (state) => ({ user: state.user, token: state.token }),
}));
