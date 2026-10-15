import { create } from "zustand";

const KEY = "pulse_ui_prefs";

const defaults = {
  autoplayVideos: true,
  dataSaver: false,
  reduceMotion: false,
  highContrast: false,
  hideLikeCounts: false,
  pauseNotifications: false,
  downloadOriginal: true,
};

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...defaults, ...(raw && typeof raw === "object" ? raw : {}) };
  } catch {
    return { ...defaults };
  }
}

export const useUiPrefs = create((set, get) => ({
  ...read(),
  setPref(key, value) {
    const next = { ...get(), [key]: value };
    const { setPref: _, ...prefs } = next;
    localStorage.setItem(KEY, JSON.stringify(prefs));
    set({ [key]: value });
  },
}));
