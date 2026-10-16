import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./providers/ThemeProvider";
import LanguageRoot from "./features/i18n/LanguageRoot";
import { useUiPrefs } from "./stores/useUiPrefs";
import { captureGoogleRedirect } from "./features/auth/services/googleOAuth";
import "./styles/variables.css";
import "./styles/globals.css";

captureGoogleRedirect();

/** Intro oynayacaqsa ünvanı / et — BrowserRouter /login ilə açılmasın. */
try {
    const skipIntro = sessionStorage.getItem("pulse_skip_intro") === "1";
    const googleBusy = Boolean(
        sessionStorage.getItem("pulse_google_id_token")
        || sessionStorage.getItem("pulse_google_pending")
    );
    if (!skipIntro && !googleBusy) {
        const { pathname, search } = window.location;
        if (pathname === "/login" && !new URLSearchParams(search).get("add")) {
            window.history.replaceState(null, "", "/");
        }
        sessionStorage.setItem("pulse_intro_playing", "1");
    }
} catch {
    /* ignore */
}

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