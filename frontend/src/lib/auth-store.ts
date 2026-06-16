import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "./api/client";

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;

  setAuth: (tokens: { accessToken: string; refreshToken: string }, user: AuthUser) => void;
  setAccessToken: (token: string) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  logout: () => void;
  isLoggedIn: () => boolean;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      setAuth: ({ accessToken, refreshToken }, user) =>
        set({ accessToken, refreshToken, user }),

      setAccessToken: (accessToken) => set({ accessToken }),

      updateUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),

      logout: () => set({ accessToken: null, refreshToken: null, user: null }),

      isLoggedIn: () => !!get().accessToken,
    }),
    {
      name: "autopayke-auth",
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
    }
  )
);
