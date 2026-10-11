import { create } from "zustand";

export const usePostStore = create((set) => ({
  items: [],
  page: 1,
  hasMore: true,
  setFeed: (items, hasMore, page) => set({ items, hasMore, page }),
  appendFeed: (items, hasMore, page) =>
    set((s) => {
      const seen = new Set(s.items.map((p) => p.id));
      return { items: [...s.items, ...items.filter((p) => !seen.has(p.id))], hasMore, page };
    }),
  updatePost: (id, patch) =>
    set((s) => ({ items: s.items.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
}));
