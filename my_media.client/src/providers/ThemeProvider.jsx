import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../features/auth/store/useAuthStore";

const ThemeContext = createContext(null);

function accountThemeKey(userId) {
  return `pulse_theme_${userId}`;
}

function readAccountTheme(userId) {
  if (!userId) return "light";
  try {
    const saved = localStorage.getItem(accountThemeKey(userId));
    if (saved === "dark" || saved === "light") return saved;
    const legacy = localStorage.getItem("pulse_theme");
    if (legacy === "dark" || legacy === "light") {
      localStorage.setItem(accountThemeKey(userId), legacy);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return "light";
}

function writeAccountTheme(userId, mode) {
  if (!userId) return;
  try {
    localStorage.setItem(accountThemeKey(userId), mode);
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }) {
  const userId = useAuthStore((s) => s.user?.id) || null;
  const [theme, setThemeState] = useState("light");

  useEffect(() => {
    const mode = userId ? readAccountTheme(userId) : "light";
    setThemeState(mode);
  }, [userId]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme(next) {
        if (!userId) {
          setThemeState("light");
          return;
        }
        const mode = next === "dark" ? "dark" : "light";
        writeAccountTheme(userId, mode);
        setThemeState(mode);
      },
      toggle() {
        if (!userId) return;
        const next = theme === "dark" ? "light" : "dark";
        writeAccountTheme(userId, next);
        setThemeState(next);
      },
    }),
    [theme, userId]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
