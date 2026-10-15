import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./providers/ThemeProvider";
import LanguageRoot from "./features/i18n/LanguageRoot";
import { useUiPrefs } from "./stores/useUiPrefs";
import "./styles/variables.css";
import "./styles/globals.css";

const prefs = useUiPrefs.getState();
document.documentElement.dataset.motion = prefs.reduceMotion ? "reduce" : "normal";
document.documentElement.dataset.contrast = prefs.highContrast ? "high" : "normal";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
    <React.StrictMode>
        <BrowserRouter>
            <ThemeProvider>
                <LanguageRoot>
                    <App />
                </LanguageRoot>
            </ThemeProvider>
        </BrowserRouter>
    </React.StrictMode>
);