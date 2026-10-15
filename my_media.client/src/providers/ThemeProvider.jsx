import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(localStorage.getItem("pulse_theme") || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme(next) {
        const mode = next === "dark" ? "dark" : "light";
        localStorage.setItem("pulse_theme", mode);
        setThemeState(mode);
      },
      toggle() {
        const next = theme === "dark" ? "light" : "dark";
        localStorage.setItem("pulse_theme", next);
        setThemeState(next);
      },
    }),
    [theme]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
