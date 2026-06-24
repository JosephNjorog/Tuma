import { create } from "zustand";
import { persist } from "zustand/middleware";

type AuthState = {
  token: string | null;
  operator: string;
  setToken: (token: string, operator?: string) => void;
  logout: () => void;
  isLoggedIn: () => boolean;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      operator: "ops",
      setToken: (token, operator = "ops") => set({ token, operator }),
      logout: () => set({ token: null, operator: "ops" }),
      isLoggedIn: () => !!get().token,
    }),
    {
      name: "autopayke-ops-auth",
      partialize: (s) => ({ token: s.token, operator: s.operator }),
    }
  )
);
