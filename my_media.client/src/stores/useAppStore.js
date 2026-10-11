import { create } from "zustand";

export const useAppStore = create((set) => ({
  createOpen: false,
  storyOpen: false,
  reelCreateOpen: false,
  shareTarget: null,
  setCreateOpen: (createOpen) => set({ createOpen }),
  setStoryOpen: (storyOpen) => set({ storyOpen }),
  setReelCreateOpen: (reelCreateOpen) => set({ reelCreateOpen }),
  setShareTarget: (shareTarget) => set({ shareTarget }),
}));
