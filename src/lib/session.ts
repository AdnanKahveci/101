"use client";
import { create } from "zustand";
import { api } from "./api";

export interface Me {
  id: string;
  username: string;
  displayName: string;
  isGuest: boolean;
  avatar: string;
}

interface SessionState {
  me: Me | null;
  loaded: boolean;
  refresh: () => Promise<Me | null>;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  me: null,
  loaded: false,
  refresh: async () => {
    try {
      const { user } = await api<{ user: Me | null }>("/api/auth/me");
      set({ me: user, loaded: true });
      return user;
    } catch {
      set({ me: null, loaded: true });
      return null;
    }
  },
  logout: async () => {
    await api("/api/auth/logout", { body: {} });
    set({ me: null });
  },
}));
