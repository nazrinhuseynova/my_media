import { create } from "zustand";

const KEY = "pulse_notice";

export const useNoticeStore = create((set) => ({
  text: "",
  kind: "ok",
  tick: 0,
  show: (text, kind = "ok") => set((state) => {
    const tick = state.tick + 1;
    const payload = { text, kind, tick };
    try {
      sessionStorage.setItem(KEY, JSON.stringify(payload));
    } catch {
    }
    return payload;
  }),
  clear: () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
    }
    set({ text: "" });
  },
}));

export function notify(text, isError = false) {
  useNoticeStore.getState().show(text, isError ? "bad" : "ok");
}

export function readStoredNotice() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
