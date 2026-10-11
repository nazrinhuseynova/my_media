import { create } from "zustand";
import { api } from "../../../services/api";

export const useStoryStore = create((set) => ({
  groups: [],
  async load() {
    try {
      const groups = await api.get("/api/stories");
      const list = Array.isArray(groups) ? groups : [];
      set({ groups: list });
      return list;
    } catch {
      set({ groups: [] });
      return [];
    }
  },
  markSeen(userId) {
    set((s) => ({
      groups: s.groups.map((g) => (g.user?.id === userId ? { ...g, seen: true } : g)),
    }));
  },
}));
