import { create } from "zustand";
import { api } from "../../services/api";
import { useAuthStore } from "../auth/store/useAuthStore";
import { chooseLanguage, currentLanguage } from "./engine";

export const useLanguage = create((set) => ({
  code: currentLanguage(),
  open: false,
  busy: "",
  show: () => set({ open: true }),
  hide: () => set({ open: false, busy: "" }),
  pick: async (code) => {
    set({ busy: code });
    try {
      const user = useAuthStore.getState().user;
      if (user?.id) {
        const saved = await api.patch("/api/profile/language", { language: code });
        useAuthStore.getState().setUser(saved);
      }
      await chooseLanguage(code);
      set({ code, busy: "", open: false });
    } catch {
      set({ busy: "" });
    }
  },
}));
