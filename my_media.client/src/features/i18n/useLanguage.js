import { create } from "zustand";
import { chooseLanguage, currentLanguage } from "./engine";

export const useLanguage = create((set) => ({
  code: currentLanguage(),
  open: false,
  busy: "",
  show: () => set({ open: true }),
  hide: () => set({ open: false, busy: "" }),
  pick: async (code) => {
    set({ busy: code });
    await chooseLanguage(code);
    set({ code, busy: "", open: false });
  },
}));
